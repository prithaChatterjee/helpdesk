import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { processMaintenanceJob } from './maintenance';

const job = (name: string) => ({ name }) as Job;

describe('processMaintenanceJob', () => {
  it('handles ping', async () => {
    await expect(processMaintenanceJob(job('ping'))).resolves.toEqual({ ok: true });
  });

  it('rejects unknown job names', async () => {
    await expect(processMaintenanceJob(job('nope'))).rejects.toThrow(
      'Unknown maintenance job: nope',
    );
  });
});
