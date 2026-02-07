/**
 * Channel types for notifications
 */

export interface ChannelConfig {
  slack?: SlackConfig;
  console?: ConsoleConfig;
  telegram?: TelegramConfig;
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface ConsoleConfig {
  enabled: boolean;
  colors: boolean;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface Notification {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Channel {
  name: string;
  send(notification: Notification): Promise<void>;
}
