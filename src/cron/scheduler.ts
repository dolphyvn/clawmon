/**
 * Cron scheduler for periodic health checks and reports
 */

import type { ScheduledJob, JobResult } from './types.js';

export class CronScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;

  /**
   * Add a scheduled job
   */
  addJob(job: ScheduledJob): void {
    this.jobs.set(job.id, job);
    if (this.running && job.enabled) {
      this.scheduleJob(job);
    }
  }

  /**
   * Remove a job
   */
  removeJob(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
    this.jobs.delete(jobId);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    this.running = true;
    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Get all jobs
   */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Run a job immediately
   */
  async runJob(jobId: string): Promise<JobResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const start = Date.now();
    try {
      await job.handler();
      return {
        jobId,
        timestamp: Date.now(),
        success: true,
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        jobId,
        timestamp: Date.now(),
        success: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private scheduleJob(job: ScheduledJob): void {
    const schedule = this.parseSchedule(job.schedule);

    const runAndReschedule = async () => {
      if (!this.running || !job.enabled) return;

      const start = Date.now();
      job.lastRun = start;

      try {
        await job.handler();
      } catch (error) {
        console.error(`Job ${job.name} failed:`, error);
      }

      if (this.running && job.enabled) {
        job.nextRun = Date.now() + schedule.interval;
        const timer = setTimeout(runAndReschedule, schedule.interval);
        this.timers.set(job.id, timer);
      }
    };

    // Initial delay
    job.nextRun = Date.now() + schedule.initialDelay;
    const timer = setTimeout(runAndReschedule, schedule.initialDelay);
    this.timers.set(job.id, timer);
  }

  private parseSchedule(schedule: string): { initialDelay: number; interval: number } {
    // Check if it's a number (interval in ms)
    const num = parseInt(schedule);
    if (!isNaN(num)) {
      return { initialDelay: num, interval: num };
    }

    // Simple cron parsing (only a subset supported)
    // Format: "*/5 * * * *" = every 5 minutes
    const parts = schedule.split(/\s+/);
    if (parts.length === 5) {
      const minute = parts[0];
      if (minute.startsWith('*/')) {
        const intervalMinutes = parseInt(minute.substring(2));
        const ms = intervalMinutes * 60 * 1000;
        return { initialDelay: ms, interval: ms };
      }
    }

    // Default: 1 minute
    return { initialDelay: 60000, interval: 60000 };
  }
}

/**
 * Create a health check job
 */
export function createHealthCheckJob(
  handler: () => Promise<void>,
  intervalMs: number = 60000
): ScheduledJob {
  return {
    id: 'health-check',
    name: 'Periodic Health Check',
    schedule: String(intervalMs),
    handler,
    enabled: true,
  };
}

/**
 * Create a daily report job
 */
export function createDailyReportJob(
  handler: () => Promise<void>,
  hour: number = 9
): ScheduledJob {
  // Calculate seconds until next scheduled time
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
  const initialDelay = next.getTime() - now.getTime();

  return {
    id: 'daily-report',
    name: 'Daily Report',
    schedule: `${hour} * * *`,
    handler,
    enabled: true,
  };
}
