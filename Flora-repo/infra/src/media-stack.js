import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import {
  AllowedMethods,
  Distribution,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  CfnAccessKey,
  CompositePrincipal,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
  User,
} from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import {
  LIFECYCLE_TAG,
  PENDING_RETENTION_DAYS,
  PENDING_STATE,
  UPLOAD_KEY_PREFIX,
} from '@flora/shared';

/**
 * Where Flora's photos live.
 *
 * The bucket is private end to end. Phones WRITE through presigned PUT URLs the
 * API signs, and READ through the CloudFront distribution in front of it — no
 * public ACL, no bucket policy open to the internet, and no credentials on the
 * device either way.
 *
 * The distribution domain is what `FLORA_MEDIA_BASE_URL` must be set to: the
 * API stores keys and builds URLs from that base at read time, so nothing in
 * the database has to change if this stack is redeployed under a new domain.
 */
export class FloraMediaStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & {
   *   allowedOrigins?: string[],
   *   apiHosting?: 'aws'|'external',
   * }} [props]
   */
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    // Where apps/api runs decides how it authenticates to the bucket. Default
    // 'external': it is the only one that works before a compute stack exists.
    const apiHosting = props.apiHosting ?? 'external';

    const bucket = new Bucket(this, 'MediaBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Photos are user content: keep them if the stack is torn down by mistake.
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          // The PUT the phone makes against a presigned URL is a cross-origin
          // request; without this the browser build of the app cannot upload.
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: props.allowedOrigins ?? ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        // A phone that dies mid-upload leaves a part behind that nothing will
        // ever finish; a week is far longer than any upload takes.
        { abortIncompleteMultipartUploadAfter: Duration.days(7) },
        {
          // Uploads are signed before anything references them, so some are
          // scans people abandoned and posts they never published. Those land
          // tagged pending and are deleted here; the API retags an object
          // attached the moment a row names it, which takes it out of this
          // rule's scope. The tag and the retention are shared constants
          // (packages/shared/src/media.js) precisely so the API and this rule
          // cannot drift apart.
          id: 'ExpireUnattachedUploads',
          tagFilters: { [LIFECYCLE_TAG]: PENDING_STATE },
          expiration: Duration.days(PENDING_RETENTION_DAYS),
        },
      ],
    });

    // What the API is allowed to do with the bucket, and nothing more: sign and
    // write uploads, read them back for recognition, and retag one attached.
    // No ListBucket and no DeleteObject — the API never needs either, and a
    // leaked credential should not be able to enumerate or destroy the photos.
    const accessPolicy = new ManagedPolicy(this, 'MediaAccess', {
      statements: [
        new PolicyStatement({
          actions: ['s3:PutObject', 's3:GetObject', 's3:PutObjectTagging'],
          resources: [bucket.arnForObjects(`${UPLOAD_KEY_PREFIX}*`)],
        }),
      ],
    });

    // Two ways to hand that policy to the API, because there are two places it
    // can run. On AWS it assumes a role and there is no long-lived secret
    // anywhere; hosted elsewhere it needs a key, and the only safe place for
    // one is Secrets Manager — never a stack output, which is plaintext in
    // CloudFormation and readable by anyone with describe-stacks.
    if (apiHosting === 'aws') {
      const role = new Role(this, 'MediaApiRole', {
        assumedBy: new CompositePrincipal(
          new ServicePrincipal('ecs-tasks.amazonaws.com'),
          new ServicePrincipal('apprunner.amazonaws.com'),
        ),
        description: 'Read/write access to Flora uploaded photos, for apps/api',
      });
      role.addManagedPolicy(accessPolicy);
      this.apiRole = role;

      new CfnOutput(this, 'MediaApiRoleArn', {
        value: role.roleArn,
        description: 'Task/instance role for apps/api',
      });
    } else {
      const user = new User(this, 'MediaApiUser', { managedPolicies: [accessPolicy] });
      const accessKey = new CfnAccessKey(this, 'MediaApiAccessKey', { userName: user.userName });

      const secret = new Secret(this, 'MediaApiCredentials', {
        description: 'AWS keys for apps/api running outside AWS',
        secretObjectValue: {
          AWS_ACCESS_KEY_ID: SecretValue.resourceAttribute(accessKey.ref),
          AWS_SECRET_ACCESS_KEY: SecretValue.resourceAttribute(accessKey.attrSecretAccessKey),
        },
      });
      this.apiUser = user;

      new CfnOutput(this, 'MediaApiCredentialsSecret', {
        value: secret.secretName,
        description:
          'Secrets Manager entry holding the API keys: ' +
          'aws secretsmanager get-secret-value --secret-id <this>',
      });
    }

    const distribution = new Distribution(this, 'MediaCdn', {
      defaultBehavior: {
        // Origin access control: CloudFront signs its requests to the bucket,
        // which is what lets the bucket stay closed to everyone else.
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
      },
      comment: 'Flora uploaded photos',
    });

    this.bucket = bucket;
    this.distribution = distribution;

    new CfnOutput(this, 'MediaBucketName', {
      value: bucket.bucketName,
      description: 'FLORA_S3_BUCKET for apps/api',
    });
    new CfnOutput(this, 'MediaBaseUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'FLORA_MEDIA_BASE_URL for apps/api',
    });
  }
}
