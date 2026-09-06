import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import {
  OperatingRuleResponse,
  CreateOperatingRuleRequest,
} from './create-operating-rule.contracts.js';
import { CreateOperatingRuleHandler } from './create-operating-rule.handler.js';

@ApiTags('admin/operating-rules')
@Controller('api/admin/operating-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class CreateOperatingRuleController {
  constructor(private readonly handler: CreateOperatingRuleHandler) {}

  @Post()
  @ApiCreatedResponse({ type: OperatingRuleResponse })
  async create(
    @Body() request: CreateOperatingRuleRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<OperatingRuleResponse | ProblemDetails> {
    const result = await this.handler.handle(request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    res.status(201);
    return result.value;
  }
}
