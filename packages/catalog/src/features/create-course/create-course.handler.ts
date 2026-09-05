import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Clock, fail, ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { ClubEntity } from '../../persistence/club.entity.js';
import { CourseEntity } from '../../persistence/course.entity.js';
import { CourseResponse, CreateCourseRequest } from './create-course.contracts.js';

@Injectable()
export class CreateCourseHandler {
  constructor(
    @InjectRepository(ClubEntity, 'catalog') private readonly clubs: Repository<ClubEntity>,
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
    private readonly clock: Clock,
  ) {}

  async handle(request: CreateCourseRequest): Promise<Result<CourseResponse>> {
    // 이 SELECT는 404 UX용이고, FK가 생성-삭제 경쟁 상태의 최종 방어선이다.
    const club = await this.clubs.findOneBy({ id: request.clubId });
    if (club === null) {
      return fail('ClubNotFound', 'Club을 찾을 수 없다.');
    }

    const course = this.courses.create({
      id: crypto.randomUUID(),
      clubId: club.id,
      name: request.name,
      holeCount: request.holeCount ?? 18,
      isActive: true,
      createdAt: this.clock.now(),
    });
    return ok(toCourseResponse(await this.courses.save(course)));
  }
}

export function toCourseResponse(course: CourseEntity): CourseResponse {
  return new CourseResponse({
    courseId: course.id,
    clubId: course.clubId,
    name: course.name,
    holeCount: course.holeCount,
    isActive: course.isActive,
    createdAt: course.createdAt.toString(),
  });
}
