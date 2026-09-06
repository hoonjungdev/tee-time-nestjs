import { CatalogApi } from '@teetime/catalog-contracts';
import { Clock, SystemClock } from '@teetime/shared-kernel';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogApiService } from './api/catalog-api.service.js';
import { CreateClubController } from './features/create-club/create-club.controller.js';
import { CreateClubHandler } from './features/create-club/create-club.handler.js';
import { CreateCourseController } from './features/create-course/create-course.controller.js';
import { CreateCourseHandler } from './features/create-course/create-course.handler.js';
import { CreateGreenFeeRuleController } from './features/create-green-fee-rule/create-green-fee-rule.controller.js';
import { CreateGreenFeeRuleHandler } from './features/create-green-fee-rule/create-green-fee-rule.handler.js';
import { CreateOperatingRuleController } from './features/create-operating-rule/create-operating-rule.controller.js';
import { CreateOperatingRuleHandler } from './features/create-operating-rule/create-operating-rule.handler.js';
import { ListClubsController } from './features/list-clubs/list-clubs.controller.js';
import { ListClubsHandler } from './features/list-clubs/list-clubs.handler.js';
import { ListCoursesController } from './features/list-courses/list-courses.controller.js';
import { ListCoursesHandler } from './features/list-courses/list-courses.handler.js';
import { ListGreenFeeRulesController } from './features/list-green-fee-rules/list-green-fee-rules.controller.js';
import { ListGreenFeeRulesHandler } from './features/list-green-fee-rules/list-green-fee-rules.handler.js';
import { ListOperatingRulesController } from './features/list-operating-rules/list-operating-rules.controller.js';
import { ListOperatingRulesHandler } from './features/list-operating-rules/list-operating-rules.handler.js';
import { UpdateClubController } from './features/update-club/update-club.controller.js';
import { UpdateClubHandler } from './features/update-club/update-club.handler.js';
import { UpdateCourseController } from './features/update-course/update-course.controller.js';
import { UpdateCourseHandler } from './features/update-course/update-course.handler.js';
import { UpdateGreenFeeRuleController } from './features/update-green-fee-rule/update-green-fee-rule.controller.js';
import { UpdateGreenFeeRuleHandler } from './features/update-green-fee-rule/update-green-fee-rule.handler.js';
import { UpdateOperatingRuleController } from './features/update-operating-rule/update-operating-rule.controller.js';
import { UpdateOperatingRuleHandler } from './features/update-operating-rule/update-operating-rule.handler.js';
import { catalogDataSourceOptions } from './persistence/catalog.data-source.js';
import { ClubEntity } from './persistence/club.entity.js';
import { CourseEntity } from './persistence/course.entity.js';
import { GreenFeeRuleEntity } from './persistence/green-fee-rule.entity.js';
import { OperatingRuleEntity } from './persistence/operating-rule.entity.js';

/**
 * 마스터 데이터. 얇은 CRUD.
 *
 * 이 패키지에서 공개되는 유일한 심볼이다. 컨트롤러·핸들러·엔티티는 전부 내부이며
 * `exports` 필드가 서브패스를 열지 않으므로 밖에서 참조할 수 없다 → docs/modules.md
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ name: 'catalog', useFactory: catalogDataSourceOptions }),
    TypeOrmModule.forFeature(
      [ClubEntity, CourseEntity, OperatingRuleEntity, GreenFeeRuleEntity],
      'catalog',
    ),
  ],
  controllers: [
    CreateOperatingRuleController,
    UpdateOperatingRuleController,
    ListOperatingRulesController,
    CreateGreenFeeRuleController,
    UpdateGreenFeeRuleController,
    ListGreenFeeRulesController,
    CreateClubController,
    UpdateClubController,
    ListClubsController,
    CreateCourseController,
    UpdateCourseController,
    ListCoursesController,
  ],
  exports: [CatalogApi],
  providers: [
    { provide: CatalogApi, useClass: CatalogApiService },
    CreateOperatingRuleHandler,
    UpdateOperatingRuleHandler,
    ListOperatingRulesHandler,
    CreateGreenFeeRuleHandler,
    UpdateGreenFeeRuleHandler,
    ListGreenFeeRulesHandler,
    CreateClubHandler,
    UpdateClubHandler,
    ListClubsHandler,
    CreateCourseHandler,
    UpdateCourseHandler,
    ListCoursesHandler,
    { provide: Clock, useClass: SystemClock },
  ],
})
export class CatalogModule {}
