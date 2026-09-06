import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Matches, Min, Max, ValidateIf } from 'class-validator';
import type { DayType, TimeBand } from '../../pricing/green-fee-policy.js';

export const DAY_TYPES = ['Weekday', 'Weekend'] as const satisfies readonly DayType[];
export const TIME_BANDS = ['Early', 'Mid', 'Late'] as const satisfies readonly TimeBand[];
export const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateGreenFeeRuleRequest {
  @ApiProperty()
  @IsUUID()
  courseId: string = '';

  @ApiProperty({ enum: DAY_TYPES })
  @IsIn(DAY_TYPES)
  dayType: DayType | '' = '';

  @ApiProperty({ enum: TIME_BANDS })
  @IsIn(TIME_BANDS)
  timeBand: TimeBand | '' = '';

  @ApiProperty({ example: '150000.00', pattern: AMOUNT_PATTERN.source })
  @Matches(AMOUNT_PATTERN)
  amount: string = '';

  @ApiPropertyOptional({ default: 0, minimum: -32768, maximum: 32767 })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsInt()
  @Min(-32768)
  @Max(32767)
  priority?: number;
}

export class GreenFeeRuleResponse {
  @ApiProperty()
  readonly greenFeeRuleId: string;

  @ApiProperty()
  readonly courseId: string;

  @ApiProperty({ enum: DAY_TYPES })
  readonly dayType: DayType;

  @ApiProperty({ enum: TIME_BANDS })
  readonly timeBand: TimeBand;

  @ApiProperty({ example: '150000.00' })
  readonly amount: string;

  @ApiProperty()
  readonly currency: string;

  @ApiProperty()
  readonly priority: number;

  @ApiProperty()
  readonly isActive: boolean;

  constructor(input: {
    readonly greenFeeRuleId: string;
    readonly courseId: string;
    readonly dayType: DayType;
    readonly timeBand: TimeBand;
    readonly amount: string;
    readonly currency: string;
    readonly priority: number;
    readonly isActive: boolean;
  }) {
    this.greenFeeRuleId = input.greenFeeRuleId;
    this.courseId = input.courseId;
    this.dayType = input.dayType;
    this.timeBand = input.timeBand;
    this.amount = input.amount;
    this.currency = input.currency;
    this.priority = input.priority;
    this.isActive = input.isActive;
  }
}
