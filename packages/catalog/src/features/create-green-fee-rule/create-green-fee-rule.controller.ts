import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import {
  GreenFeeRuleResponse,
  CreateGreenFeeRuleRequest,
} from './create-green-fee-rule.contracts.js';
import { CreateGreenFeeRuleHandler } from './create-green-fee-rule.handler.js';

@ApiTags('admin/green-fee-rules')
@Controller('api/admin/green-fee-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class CreateGreenFeeRuleController {
  constructor(private readonly handler: CreateGreenFeeRuleHandler) {}

  @Post()
  @ApiCreatedResponse({ type: GreenFeeRuleResponse })
  async create(
    @Body() request: CreateGreenFeeRuleRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<GreenFeeRuleResponse | ProblemDetails> {
    const result = await this.handler.handle(request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    res.status(201);
    return result.value;
  }
}
