import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClubAndCourse1788581480000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE catalog.clubs (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        region text NOT NULL,
        time_zone text NOT NULL,
        address text NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL
      )
    `);
    await runner.query('CREATE INDEX ix_clubs_region ON catalog.clubs (region) WHERE is_active');
    await runner.query(`
      CREATE TABLE catalog.courses (
        id uuid PRIMARY KEY,
        club_id uuid NOT NULL REFERENCES catalog.clubs(id),
        name text NOT NULL,
        hole_count smallint NOT NULL DEFAULT 18,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE catalog.courses');
    await runner.query('DROP TABLE catalog.clubs');
  }
}
