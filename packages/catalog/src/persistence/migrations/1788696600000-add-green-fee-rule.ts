import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGreenFeeRule1788696600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE catalog.green_fee_rules (
        id uuid PRIMARY KEY,
        course_id uuid NOT NULL REFERENCES catalog.courses(id),
        day_type text NOT NULL,
        time_band text NOT NULL,
        amount numeric(12,2) NOT NULL,
        currency char(3) NOT NULL DEFAULT 'KRW',
        priority smallint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await runner.query(
      'CREATE INDEX ix_fee_lookup ON catalog.green_fee_rules (course_id, day_type, time_band, priority DESC) WHERE is_active',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE catalog.green_fee_rules');
  }
}
