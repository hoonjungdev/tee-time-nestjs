import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateClubRequest {
  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 50)
  region?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  address?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
