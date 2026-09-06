import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatingRule1788696000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE catalog.operating_rules (
        id uuid PRIMARY KEY,
        course_id uuid NOT NULL REFERENCES catalog.courses(id),
        day_type text NOT NULL,
        open_time time NOT NULL,
        close_time time NOT NULL,
        interval_minutes smallint NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await runner.query(
      'CREATE UNIQUE INDEX ux_oprule ON catalog.operating_rules (course_id, day_type) WHERE is_active',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE catalog.operating_rules');
  }
}
