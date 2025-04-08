import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IPostUserCreated, IUserContext } from '@rocket.chat/apps-engine/definition/users';
import { settings } from './settings/settings';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages/IMessage';

export class AgentLicenseLimitWarningApp extends App implements IPostUserCreated {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        await Promise.all(settings.map((setting) => configuration.settings.provideSetting(setting)));
    }

    private async buildDirectMessage(read: IRead, modify: IModify, userId: string, workspaceUrl: string, maxUsers: number, activeUsers: number, percentageUsed: number): Promise<IMessage | null> {
        try {
            const appUser = await read.getUserReader().getAppUser();
            const notifyUser = await read.getUserReader().getById(userId);
            if (!appUser || !notifyUser) {
                this.getLogger().error(`App user or notify user not found: ${userId}`);
                return null;
            }

            let room = await read.getRoomReader().getDirectByUsernames([appUser.username, notifyUser.username]);
            if (!room) {
                this.getLogger().info(`Direct message room not found for user: ${notifyUser.username}, creating one.`);
                const roomBuilder = modify.getCreator().startRoom()
                    .setType(RoomType.DIRECT_MESSAGE)
                    .setCreator(appUser)
                    .addMemberToBeAddedByUsername(notifyUser.username);

                await modify.getCreator().finish(roomBuilder);

                room = await read.getRoomReader().getDirectByUsernames([appUser.username, notifyUser.username]);
                if (!room) {
                    this.getLogger().error(`Failed to retrieve the room after creating DM with user ${notifyUser.username}`);
                    return null;
                }

                this.getLogger().info(`Direct message room created: ${room.id}`);
            }

            return modify.getCreator().startMessage()
                .setSender(appUser)
                .setRoom(room)
                .setText(`🚨 *Alert*: Approaching max users on license!\n\n*Workspace URL:* ${workspaceUrl}\n*Max Users:* ${maxUsers}\n*Active Users:* ${activeUsers}\n*Usage:* ${percentageUsed}%`)
                .getMessage();
        } catch (error) {
            this.getLogger().error(`Error building direct message: ${error.message || error}`);
            return null;
        }
    }

    private async sendDirectMessage(modify: IModify, message: IMessage): Promise<void> {
        try {
            const messageBuilder = modify.getCreator().startMessage(message);
            this.getLogger().log('the room id is', message.room.id);
            messageBuilder.setRoom(message.room);
            messageBuilder.setSender(message.sender);
            await modify.getCreator().finish(messageBuilder);
            this.getLogger().info(`Direct message sent successfully.`);
        } catch (error) {
            this.getLogger().error(`Error sending direct message: ${error.message || error}`);
        }
    }

    public async executePostUserCreated(context: IUserContext, read: IRead, http: IHttp, persis: IPersistence, modify: IModify): Promise<void> {
        const user = context.user;
        this.getLogger().info(`New user created: ${user.username}`);

        let percentageUsed;
        let maxUsers;
        let activeUsers;
        const workspaceUrl = await read.getEnvironmentReader().getSettings().getValueById('workspace_url');

        try {
            const authToken = await read.getEnvironmentReader().getSettings().getValueById('workspace_auth_token');
            const userId = await read.getEnvironmentReader().getSettings().getValueById('workspace_user_id');

            const apiUrl = `${workspaceUrl}/api/v1/licenses.maxActiveUsers`;

            const response = await http.get(apiUrl, {
                headers: {
                    'accept': '*/*',
                    'x-auth-token': authToken,
                    'x-user-id': userId,
                    'content-type': 'application/json',
                },
            });

            if (!response) {
                this.getLogger().error(`HTTP request failed: response is null or undefined.`);
                return;
            }

            if (response.statusCode === 200 && response.data) {
                maxUsers = response.data?.maxActiveUsers;
                activeUsers = response.data?.activeUsers;

                percentageUsed = Math.floor((activeUsers / maxUsers) * 100);

                this.getLogger().info(`Max Active Users: ${maxUsers}`);
                this.getLogger().info(`Current Active Users: ${activeUsers}`);
                this.getLogger().info(`Percentage of Max Users Used: ${percentageUsed}%`);
            } else {
                this.getLogger().error(`Failed to fetch license info: ${response.statusCode} - ${response.content}`);
            }
        } catch (error) {
            this.getLogger().error(`Error making license info request: ${error.message || error}`);
        }

        const notifyUser = await read.getEnvironmentReader().getSettings().getValueById('notify_user');
        const notifyUserId = await read.getEnvironmentReader().getSettings().getValueById('notify_user_id');
        const licenseUsageThreshold = await read.getEnvironmentReader().getSettings().getValueById('license_usage_threshold');

        const notifyRoom = await read.getEnvironmentReader().getSettings().getValueById('notify_room');
        const roomSetting = await read.getEnvironmentReader().getSettings().getValueById('notify_room_id');

        const notifyEndpoint = await read.getEnvironmentReader().getSettings().getValueById('notify_endpoint');
        const notifyEndpointUrl = await read.getEnvironmentReader().getSettings().getValueById('notify_endpoint_url');

        if (percentageUsed >= licenseUsageThreshold) {
            this.getLogger().info(`License usage exceeds threshold: ${licenseUsageThreshold}%`);

            if (notifyUser) {
                this.getLogger().info(`Notifying user ID: ${notifyUserId}`);
                const message = await this.buildDirectMessage(read, modify, notifyUserId, workspaceUrl, maxUsers, activeUsers, percentageUsed);
                if (message) {
                    await this.sendDirectMessage(modify, message);
                }
            }

            this.getLogger().debug(`notifyRoom setting: ${notifyRoom}`);
            this.getLogger().debug(`roomSetting raw value: ${JSON.stringify(roomSetting)}`);

            let roomIds: string[] = [];

            if (typeof roomSetting === 'string') {
                roomIds = [roomSetting];
            } else if (Array.isArray(roomSetting)) {
                roomIds = roomSetting.map((r) => r._id || r.id).filter(Boolean);
            } else if (typeof roomSetting === 'object' && roomSetting !== null) {
                const id = roomSetting._id || roomSetting.id;
                if (id) {
                    roomIds = [id];
                }
            }

            this.getLogger().debug(`Extracted roomIds: ${roomIds.join(', ')}`);

            if (notifyRoom && roomIds.length > 0) {
                const appUser = await read.getUserReader().getAppUser();
                if (!appUser) {
                    this.getLogger().error(`App user not found.`);
                } else {
                    const alertText = `🚨 *Alert*: Approaching max users on license!\n\n*Workspace URL:* ${workspaceUrl}\n*Max Users:* ${maxUsers}\n*Active Users:* ${activeUsers}\n*Usage:* ${percentageUsed}%`;

                    for (const id of roomIds) {
                        try {
                            const targetRoom = await read.getRoomReader().getById(id);
                            if (!targetRoom) {
                                this.getLogger().error(`Room not found with ID: ${id}`);
                                continue;
                            }

                            try {
                                await modify.getExtender().extendRoom(targetRoom.id, appUser);
                            } catch (e) {
                                this.getLogger().warn(`App user may already be in room ${id} or cannot be added: ${e.message || e}`);
                            }

                            const message = modify.getCreator().startMessage()
                                .setSender(appUser)
                                .setRoom(targetRoom)
                                .setText(alertText);

                            await modify.getCreator().finish(message);
                            this.getLogger().info(`Message sent to room: ${targetRoom.displayName || targetRoom.slugifiedName}`);
                        } catch (e) {
                            this.getLogger().error(`Failed to notify room ID ${id}: ${e.message || e}`);
                        }
                    }
                }
            }

            if (notifyEndpoint) {
                this.getLogger().info(`Notifying endpoint: ${notifyEndpointUrl}`);
                try {
                    const notifyResponse = await http.post(notifyEndpointUrl, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        data: {
                            workspaceUrl,
                            maxUsers,
                            activeUsers,
                            percentageUsed,
                            alert: "Approaching max users on license",
                        },
                    });

                    if (notifyResponse.statusCode === 200) {
                        this.getLogger().info(`Successfully notified endpoint: ${notifyEndpointUrl}`);
                    } else {
                        this.getLogger().error(`Failed to notify endpoint: ${notifyResponse.statusCode} - ${notifyResponse.content}`);
                    }
                } catch (error) {
                    this.getLogger().error(`Error notifying endpoint: ${error.message || error}`);
                }
            }
        }
    }
}
