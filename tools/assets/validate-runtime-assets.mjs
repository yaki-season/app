#!/usr/bin/env node

import { validateRuntimeAssets } from './runtime-assets-lib.mjs';

try {
  const { errors, manifest } = await validateRuntimeAssets();
  if (errors.length > 0) {
    console.error(`runtime asset 검증 실패 (${errors.length}건)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`runtime asset 검증 통과: ${manifest.assets.length}개`);
  }
} catch (error) {
  console.error(`runtime asset 검증을 실행하지 못했습니다: ${error.message}`);
  process.exitCode = 1;
}
