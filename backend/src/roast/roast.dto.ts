import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const TOXICITY = ['mild', 'medium', 'nuclear'] as const;
export type Toxicity = (typeof TOXICITY)[number];

export const LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_CODE_CHARS = 12_000; // keeps prompt + answer inside the model's 8k-token context

export class RoastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE_CHARS)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[\w .@/+-]*$/, { message: 'filename contains invalid characters' })
  filename?: string;

  @IsIn(TOXICITY)
  toxicity: Toxicity;

  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;
}

export type Finding = { line: number; sev: 'CRIT' | 'WARN'; text: string };
export type RoastResult = { score: string; verdict: string; findings: Finding[] };
