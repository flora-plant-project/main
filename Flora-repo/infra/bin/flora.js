#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { FloraMediaStack, stackPrefix } from '../src/index.js';

/**
 * The CDK app. `npx aws-cdk deploy` (from infra/) reads cdk.json, which runs
 * this file; account and region come from the caller's AWS profile.
 */
const app = new App();

new FloraMediaStack(app, `${stackPrefix()}-media`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  // Tighten this once the app has a fixed web origin; the phone builds send no
  // Origin header, so '*' costs nothing today and a browser build will need it.
  allowedOrigins: (process.env.FLORA_MEDIA_CORS_ORIGINS ?? '*').split(','),
  // 'aws' once apps/api runs on ECS/App Runner — it then assumes a role and no
  // long-lived key exists anywhere. Until then the API runs elsewhere and needs
  // one, issued into Secrets Manager.
  apiHosting: process.env.FLORA_API_HOSTING === 'aws' ? 'aws' : 'external',
});
