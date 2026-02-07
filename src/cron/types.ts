/**
 * Cron scheduler types
 */

export interface CronConfig {
  healthCheckInterval: number;
  reportSchedule?: string; // cron expression
}

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // cron expression or interval in ms
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
}

export interface JobResult {
  jobId: string;
  timestamp: number;
  success: boolean;
  duration: number;
  error?: string;
}
