import { DataSource } from 'typeorm';
import { moduleDataSourceOptions } from '@teetime/persistence-kernel';

import { ClubEntity } from './club.entity.js';
import { CourseEntity } from './course.entity.js';
import { GreenFeeRuleEntity } from './green-fee-rule.entity.js';
import { AddClubAndCourse1788581480000 } from './migrations/1788581480000-add-club-and-course.js';
import { AddOperatingRule1788696000000 } from './migrations/1788696000000-add-operating-rule.js';
import { AddGreenFeeRule1788696600000 } from './migrations/1788696600000-add-green-fee-rule.js';
import { OperatingRuleEntity } from './operating-rule.entity.js';

export function catalogDataSourceOptions() {
  return moduleDataSourceOptions({
    name: 'catalog',
    entities: [ClubEntity, CourseEntity, OperatingRuleEntity, GreenFeeRuleEntity],
    migrations: [
      AddClubAndCourse1788581480000,
      AddOperatingRule1788696000000,
      AddGreenFeeRule1788696600000,
    ],
  });
}

export default new DataSource(catalogDataSourceOptions());
