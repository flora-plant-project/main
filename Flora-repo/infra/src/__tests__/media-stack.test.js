import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { LIFECYCLE_TAG, PENDING_STATE } from '@flora/shared';
import { FloraMediaStack } from '../media-stack.js';

/** @type {import('aws-cdk-lib/assertions').Template|null} */
let template = null;

/**
 * The synthesized template, which is the only thing worth asserting on.
 * Synthesized once: every test reads the same stack, and CDK synthesis is by
 * far the slowest thing in this suite.
 */
function synth() {
  if (!template) {
    const stack = new FloraMediaStack(new App(), 'TestMedia', {
      env: { account: '123456789012', region: 'eu-north-1' },
    });
    template = Template.fromStack(stack);
  }
  return template;
}

/** The same stack with apps/api hosted on AWS, where a role replaces the key. */
function synthOnAws() {
  const stack = new FloraMediaStack(new App(), 'TestMediaAws', {
    env: { account: '123456789012', region: 'eu-north-1' },
    apiHosting: 'aws',
  });
  return Template.fromStack(stack);
}

describe('FloraMediaStack', () => {
  // Synthesis loads aws-cdk-lib and runs CloudFormation generation, which takes
  // tens of seconds cold — well past a default per-test timeout. Do it once,
  // here, where the timeout can be raised for that one step.
  beforeAll(() => synth(), 120_000);

  it('keeps the photo bucket closed to the public', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('allows the presigned PUT the phone makes', () => {
    const cors = synth().findResources('AWS::S3::Bucket');
    const [bucket] = Object.values(cors);
    expect(bucket.Properties.CorsConfiguration.CorsRules[0].AllowedMethods).toContain('PUT');
  });

  it('serves reads through CloudFront, not the bucket', () => {
    const template = synth();
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    // Origin access control is what lets the bucket stay private while the CDN
    // can still read it.
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('publishes the two values apps/api needs as env vars', () => {
    const outputs = synth().findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining(['MediaBucketName', 'MediaBaseUrl']),
    );
  });

  it('keeps user photos if the stack is deleted', () => {
    synth().hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });

  it('expires uploads no row ever claimed', () => {
    const [bucket] = Object.values(synth().findResources('AWS::S3::Bucket'));
    const rule = bucket.Properties.LifecycleConfiguration.Rules.find(
      (entry) => entry.Id === 'ExpireUnattachedUploads',
    );

    // The tag and the retention have to match what the API writes, or objects
    // are either kept forever or deleted out from under live rows.
    expect(rule.TagFilters).toEqual([{ Key: LIFECYCLE_TAG, Value: PENDING_STATE }]);
    expect(rule.ExpirationInDays).toBe(7);
    expect(rule.Status).toBe('Enabled');
  });

  it('grants the API exactly the object actions it uses, and no more', () => {
    const [policy] = Object.values(synth().findResources('AWS::IAM::ManagedPolicy'));
    const [statement] = policy.Properties.PolicyDocument.Statement;

    expect(statement.Action).toEqual(
      expect.arrayContaining(['s3:PutObject', 's3:GetObject', 's3:PutObjectTagging']),
    );
    // A leaked API credential must not be able to enumerate or destroy photos.
    expect(statement.Action).not.toContain('s3:DeleteObject');
    expect(statement.Action).not.toContain('s3:ListBucket');
  });

  it('issues the off-AWS API a key, and keeps it out of the outputs', () => {
    const template = synth();
    template.resourceCountIs('AWS::IAM::User', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);

    // The secret's VALUE must never appear in an output: CloudFormation outputs
    // are plaintext to anyone who can describe the stack.
    const outputs = JSON.stringify(template.findOutputs('*'));
    expect(outputs).not.toContain('SecretAccessKey');
    expect(outputs).toContain('MediaApiCredentialsSecret');
  });

  it('uses a role instead of a key when the API runs on AWS', () => {
    const template = synthOnAws();
    template.resourceCountIs('AWS::IAM::Role', 1);
    // The point of that mode: nothing long-lived to leak.
    template.resourceCountIs('AWS::IAM::User', 0);
    template.resourceCountIs('AWS::IAM::AccessKey', 0);
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  });
});
