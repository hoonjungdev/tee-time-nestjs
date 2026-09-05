import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock, SystemClock } from '@teetime/shared-kernel';

import { CreateClubController } from './features/create-club/create-club.controller.js';
import { CreateClubHandler } from './features/create-club/create-club.handler.js';
import { CreateCourseController } from './features/create-course/create-course.controller.js';
import { CreateCourseHandler } from './features/create-course/create-course.handler.js';
import { ListClubsController } from './features/list-clubs/list-clubs.controller.js';
import { ListClubsHandler } from './features/list-clubs/list-clubs.handler.js';
import { ListCoursesController } from './features/list-courses/list-courses.controller.js';
import { ListCoursesHandler } from './features/list-courses/list-courses.handler.js';
import { UpdateClubController } from './features/update-club/update-club.controller.js';
import { UpdateClubHandler } from './features/update-club/update-club.handler.js';
import { UpdateCourseController } from './features/update-course/update-course.controller.js';
import { UpdateCourseHandler } from './features/update-course/update-course.handler.js';
import { catalogDataSourceOptions } from './persistence/catalog.data-source.js';
import { ClubEntity } from './persistence/club.entity.js';
import { CourseEntity } from './persistence/course.entity.js';

/**
 * 마스터 데이터. 얇은 CRUD.
 *
 * 이 패키지에서 공개되는 유일한 심볼이다. 컨트롤러·핸들러·엔티티는 전부 내부이며
 * `exports` 필드가 서브패스를 열지 않으므로 밖에서 참조할 수 없다 → docs/modules.md
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({ name: 'catalog', useFactory: catalogDataSourceOptions }),
    TypeOrmModule.forFeature([ClubEntity, CourseEntity], 'catalog'),
  ],
  controllers: [
    CreateClubController,
    UpdateClubController,
    ListClubsController,
    CreateCourseController,
    UpdateCourseController,
    ListCoursesController,
  ],
  providers: [
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
