import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, Matches, Min, Max, ValidateIf } from 'class-validator';
import type { DayType, TimeBand } from '../../pricing/green-fee-policy.js';
import {
  DAY_TYPES,
  TIME_BANDS,
  AMOUNT_PATTERN,
} from '../create-green-fee-rule/create-green-fee-rule.contracts.js';

export class UpdateGreenFeeRuleRequest {
  @ApiPropertyOptional({ enum: DAY_TYPES })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsIn(DAY_TYPES)
  dayType?: DayType;

  @ApiPropertyOptional({ enum: TIME_BANDS })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsIn(TIME_BANDS)
  timeBand?: TimeBand;

  @ApiPropertyOptional({ pattern: AMOUNT_PATTERN.source })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @Matches(AMOUNT_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ minimum: -32768, maximum: 32767 })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsInt()
  @Min(-32768)
  @Max(32767)
  priority?: number;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
