import { DataSource } from 'typeorm';
import { moduleDataSourceOptions } from '@teetime/persistence-kernel';

import { ClubEntity } from './club.entity.js';
import { CourseEntity } from './course.entity.js';
import { AddClubAndCourse1788581480000 } from './migrations/1788581480000-add-club-and-course.js';

export function catalogDataSourceOptions() {
  return moduleDataSourceOptions({
    name: 'catalog',
    entities: [ClubEntity, CourseEntity],
    migrations: [AddClubAndCourse1788581480000],
  });
}

export default new DataSource(catalogDataSourceOptions());
