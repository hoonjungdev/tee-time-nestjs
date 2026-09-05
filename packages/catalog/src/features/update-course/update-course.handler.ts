import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { fail, ok, type Result } from '@teetime/shared-kernel';
import type { Repository } from 'typeorm';

import { CourseEntity } from '../../persistence/course.entity.js';
import { type CourseResponse } from '../create-course/create-course.contracts.js';
import { toCourseResponse } from '../create-course/create-course.handler.js';
import { UpdateCourseRequest } from './update-course.contracts.js';

@Injectable()
export class UpdateCourseHandler {
  constructor(
    @InjectRepository(CourseEntity, 'catalog') private readonly courses: Repository<CourseEntity>,
  ) {}

  async handle(courseId: string, request: UpdateCourseRequest): Promise<Result<CourseResponse>> {
    const course = await this.courses.findOneBy({ id: courseId });
    if (course === null) {
      return fail('CourseNotFound', 'Course를 찾을 수 없다.');
    }

    if (request.name !== undefined) course.name = request.name;
    if (request.holeCount !== undefined) course.holeCount = request.holeCount;
    if (request.isActive !== undefined) course.isActive = request.isActive;

    return ok(toCourseResponse(await this.courses.save(course)));
  }
}
