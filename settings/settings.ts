import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export const settings: Array<ISetting> = [
    {
        id: 'workspace_url',
        type: SettingType.STRING,
        packageValue: 'URL',
        required: true,
        public: true,
        i18nLabel: 'Workspace Url',
        i18nDescription: `Please enter your workspace URL`,
    },
    {
        id: 'workspace_user_id',
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: true,
        i18nLabel: 'Workspace User ID',
        i18nDescription: `Enter the User ID for API authentication`,
    },
    {
        id: 'workspace_auth_token',
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Workspace Auth Token',
        i18nDescription: `Enter the authentication token for API requests`,
    },
    {
        id: 'license_usage_threshold',
        type: SettingType.NUMBER,
        packageValue: 80,
        required: true,
        public: true,
        i18nLabel: 'License Usage Threshold',
        i18nDescription: `Enter the percentage of license used before notifying`,
    },
    {
        id: 'notify_user',
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: true,
        public: true,
        i18nLabel: 'Notify User',
        i18nDescription: `Enable notifications for a specific user`,
    },
    {
        id: 'notify_user_id',
        type: SettingType.STRING,
        packageValue: '',
        required: false,
        public: true,
        i18nLabel: 'User ID',
        i18nDescription: `Enter the user ID to notify`,
    },
    {
        id: 'notify_room',
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: true,
        public: true,
        i18nLabel: 'Notify Room',
        i18nDescription: `Enable notifications for a specific room`,
    },
    {
        id: 'notify_room_id',
        type: SettingType.ROOM_PICK,
        packageValue: '',
        required: false,
        public: true,
        i18nLabel: 'Room ID',
        i18nDescription: `Enter the room ID to notify`,
    },
    {
        id: 'notify_endpoint',
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: true,
        public: true,
        i18nLabel: 'Notify Endpoint',
        i18nDescription: `Enable notifications for an external endpoint`,
    },
    {
        id: 'notify_endpoint_url',
        type: SettingType.STRING,
        packageValue: '',
        required: false,
        public: true,
        i18nLabel: 'Endpoint URL',
        i18nDescription: `Enter the URL endpoint to notify`,
    }
];