# AWS Integration

The VML Open Boilerplate integrates with several AWS services to provide scalable infrastructure capabilities.

## Supported Services

| Service             | Purpose             |
| ------------------- | ------------------- |
| Amazon SES          | Transactional email |
| Amazon S3           | File storage        |
| Amazon SQS          | Message queuing     |
| AWS Bedrock         | AI/LLM provider     |
| AWS Secrets Manager | Secret storage      |

## Configuration

### Environment Variables

```env
# AWS Credentials
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1

# SES Configuration
SES_FROM_EMAIL=noreply@yourdomain.com
SES_REPLY_TO_EMAIL=support@yourdomain.com

# S3 Configuration
S3_BUCKET=your-bucket-name
S3_UPLOAD_PREFIX=uploads/

# SQS Configuration
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/queue-name

# Bedrock Configuration
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

### IAM Policy

Minimum required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
      "Resource": "arn:aws:sqs:us-east-1:123456789:queue-name"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "*"
    }
  ]
}
```

## Amazon SES

### Email Service

```typescript
// _core/third-party/aws/aws-ses.service.ts
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

@Injectable()
export class AWSSESService {
  private client: SESClient;

  constructor() {
    this.client = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const command = new SendEmailCommand({
      Source: options.from || process.env.SES_FROM_EMAIL,
      Destination: {
        ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
        CcAddresses: options.cc,
        BccAddresses: options.bcc,
      },
      Message: {
        Subject: { Data: options.subject, Charset: "UTF-8" },
        Body: {
          Html: options.html
            ? { Data: options.html, Charset: "UTF-8" }
            : undefined,
          Text: options.text
            ? { Data: options.text, Charset: "UTF-8" }
            : undefined,
        },
      },
      ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
    });

    await this.client.send(command);
  }

  async sendRawEmail(rawMessage: string): Promise<void> {
    // For emails with attachments
    const command = new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    });

    await this.client.send(command);
  }
}
```

### SES Setup Requirements

1. **Verify domain/email** in SES console
2. **Request production access** (move out of sandbox)
3. **Configure DKIM** for better deliverability
4. **Set up bounce handling** (optional but recommended)

## Amazon S3

### S3 Service

```typescript
// _core/third-party/aws/aws-s3.service.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class AWSS3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = process.env.S3_BUCKET;
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.client.send(command);
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async getSignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async exists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
```

### File Upload Controller

```typescript
@Controller("files")
@UseGuards(AuthGuard())
export class FileController {
  constructor(private s3Service: AWSS3Service) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const key = `${process.env.S3_UPLOAD_PREFIX}${req.user.id}/${Date.now()}-${file.originalname}`;
    const url = await this.s3Service.upload(key, file.buffer, file.mimetype);

    return { url, key };
  }

  @Get("presigned-upload")
  async getPresignedUpload(
    @Query("filename") filename: string,
    @Query("contentType") contentType: string,
    @Request() req,
  ) {
    const key = `${process.env.S3_UPLOAD_PREFIX}${req.user.id}/${Date.now()}-${filename}`;
    const url = await this.s3Service.getSignedUploadUrl(key, contentType);

    return { uploadUrl: url, key };
  }
}
```

## Amazon SQS

### Queue Service

```typescript
// _core/third-party/aws/aws-sqs.service.ts
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

@Injectable()
export class AWSSQSService {
  private client: SQSClient;
  private queueUrl: string;

  constructor() {
    this.client = new SQSClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.queueUrl = process.env.SQS_QUEUE_URL;
  }

  async sendMessage(body: object, delaySeconds = 0): Promise<string> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(body),
      DelaySeconds: delaySeconds,
    });

    const result = await this.client.send(command);
    return result.MessageId;
  }

  async receiveMessages(maxMessages = 10): Promise<SQSMessage[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20, // Long polling
    });

    const result = await this.client.send(command);
    return result.Messages || [];
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await this.client.send(command);
  }
}
```

### Queue Consumer

```typescript
@Injectable()
export class QueueConsumer implements OnModuleInit {
  constructor(
    private sqsService: AWSSQSService,
    private jobProcessor: JobProcessorService,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  private async startPolling() {
    while (true) {
      try {
        const messages = await this.sqsService.receiveMessages();

        for (const message of messages) {
          await this.processMessage(message);
          await this.sqsService.deleteMessage(message.ReceiptHandle);
        }
      } catch (error) {
        console.error("Queue polling error:", error);
        await this.sleep(5000); // Wait before retrying
      }
    }
  }

  private async processMessage(message: SQSMessage) {
    const body = JSON.parse(message.Body);
    await this.jobProcessor.process(body);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

## AWS Bedrock

### Bedrock AI Service

```typescript
// _core/third-party/aws/aws-bedrock.service.ts
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

@Injectable()
export class AWSBedrockService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_BEDROCK_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.modelId = process.env.AWS_BEDROCK_MODEL_ID;
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: options.maxTokens || 1024,
      messages: [{ role: "user", content: prompt }],
      temperature: options.temperature || 0.7,
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      body: JSON.stringify(body),
      contentType: "application/json",
    });

    const response = await this.client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return result.content[0].text;
  }
}
```

## Error Handling

### AWS Error Wrapper

```typescript
@Injectable()
export class AWSErrorHandler {
  handle(error: any): never {
    if (error.name === "CredentialsError") {
      throw new InternalServerErrorException("AWS credentials not configured");
    }

    if (error.name === "NoSuchBucket") {
      throw new InternalServerErrorException("S3 bucket not found");
    }

    if (error.name === "MessageRejected") {
      throw new BadRequestException("Email rejected by SES");
    }

    throw new InternalServerErrorException("AWS service error");
  }
}
```

## Best Practices

1. **Use IAM roles** in production instead of access keys
2. **Enable CloudWatch logging** for debugging
3. **Set up alarms** for error rates and quotas
4. **Use VPC endpoints** for private network access
5. **Implement retry logic** with exponential backoff

## Next Steps

- [Notifications](notifications.md) - Email with SES
- [Configuration](../getting-started/configuration.md) - Environment setup
- [Security](../architecture/security.md) - Credential management
