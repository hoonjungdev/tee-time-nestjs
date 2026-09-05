import { Body, Controller, Param, Patch, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { CourseResponse } from '../create-course/create-course.contracts.js';
import { UpdateCourseRequest } from './update-course.contracts.js';
import { UpdateCourseHandler } from './update-course.handler.js';

@ApiTags('admin/courses')
@Controller('api/admin/courses')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class UpdateCourseController {
  constructor(private readonly handler: UpdateCourseHandler) {}

  @Patch(':courseId')
  @ApiOkResponse({ type: CourseResponse })
  async update(
    @Param('courseId') courseId: string,
    @Body() request: UpdateCourseRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<CourseResponse | ProblemDetails> {
    const result = await this.handler.handle(courseId, request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
