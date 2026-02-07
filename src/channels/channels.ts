/**
 * Notification channels
 */

// Use native fetch in Node 18+

import type { Channel, ChannelConfig, Notification, SlackConfig, ConsoleConfig } from './types.js';

export class ConsoleChannel implements Channel {
  name = 'console';

  constructor(private config: ConsoleConfig = { enabled: true, colors: true }) {}

  async send(notification: Notification): Promise<void> {
    if (!this.config.enabled) return;

    const timestamp = new Date().toISOString();
    const severity = notification.severity.toUpperCase().padEnd(8);

    let color = '';
    if (this.config.colors) {
      const colors = {
        info: '\x1b[36m',    // cyan
        warning: '\x1b[33m', // yellow
        critical: '\x1b[31m', // red
      };
      const reset = '\x1b[0m';
      color = colors[notification.severity] ?? '';
      console.log(`${color}[${timestamp}] ${severity}${reset} ${notification.title}`);
    } else {
      console.log(`[${timestamp}] ${severity} ${notification.title}`);
    }

    console.log(notification.message);

    if (notification.metadata) {
      console.log('Metadata:', JSON.stringify(notification.metadata, null, 2));
    }
  }
}

export class SlackChannel implements Channel {
  name = 'slack';

  constructor(private config: SlackConfig) {}

  async send(notification: Notification): Promise<void> {
    const color = {
      info: '#36a64f',
      warning: '#ff9900',
      critical: '#ff0000',
    }[notification.severity] || '#808080';

    const payload = {
      username: this.config.username ?? 'ClawMon',
      icon_emoji: this.config.iconEmoji ?? ':robot_face:',
      channel: this.config.channel,
      attachments: [
        {
          color,
          title: notification.title,
          text: notification.message,
          ts: Math.floor(Date.now() / 1000),
          fields: notification.metadata
            ? Object.entries(notification.metadata).map(([key, value]) => ({
                title: key,
                value: String(value),
                short: true,
              }))
            : undefined,
        },
      ],
    };

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      throw error;
    }
  }
}

export class ChannelManager {
  private channels: Channel[] = [];

  constructor(config: ChannelConfig) {
    if (config.console?.enabled ?? true) {
      this.channels.push(new ConsoleChannel(config.console));
    }

    if (config.slack?.webhookUrl) {
      this.channels.push(new SlackChannel(config.slack));
    }
  }

  async send(notification: Notification): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map((channel) => channel.send(notification))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Channel send failed:', result.reason);
      }
    }
  }

  async sendInfo(title: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'info', title, message, metadata });
  }

  async sendWarning(title: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'warning', title, message, metadata });
  }

  async sendCritical(title: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'critical', title, message, metadata });
  }
}
