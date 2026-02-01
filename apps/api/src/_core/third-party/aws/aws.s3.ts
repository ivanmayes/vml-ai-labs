import AWS, { S3 as AWSS3 } from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import { Request } from 'express';

export class S3 {
	private static readonly _isDebug = process.env.DEBUG || false;

	private static s3Config = {
		bucketName: process.env.AWS_S3_BUCKET_NAME ?? '',
		accessKeyId:
			process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey:
			process.env.AWS_S3_SECRET_ACCESS_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY,
	};

	public static async upload(
		fileBuffer: Buffer,
		fileName: string,
		fileMime: string,
		folderName?: string,
		generateNewName?: boolean,
		acl = 'public-read',
	) {
		AWS.config.update({
			accessKeyId: this.s3Config.accessKeyId,
			secretAccessKey: this.s3Config.secretAccessKey,
		});

		const s3 = new AWSS3();

		if (!folderName) {
			folderName = 'uploads/';
		} else if (!folderName.match(/\/$/)) {
			folderName = `${folderName}/`;
		}

		if (generateNewName) {
			fileName = this.generateFileName(fileName);
		}

		const file: AWS.S3.PutObjectRequest = {
			ACL: acl,
			Bucket: this.s3Config.bucketName,
			Key: folderName + fileName,
			Body: fileBuffer,
			ContentType: fileMime,
		};

		const response = await s3
			.putObject(file)
			.promise()
			.catch((err: AWS.AWSError) => {
				if (this._isDebug) {
					console.log(err);
				}
				return false;
			});

		if (response) {
			if (this._isDebug) {
				console.log('File uploaded to S3.');
			}
			return {
				status: 'success',
				message: 'File uploaded to s3.',
				path:
					'https://' +
					this.s3Config.bucketName +
					'.s3.amazonaws.com/' +
					folderName +
					fileName,
			};
		} else {
			throw "Couldn't write file to s3...";
		}
	}

	public static async remove(objects: AWS.S3.ObjectIdentifierList) {
		AWS.config.update({
			accessKeyId: this.s3Config.accessKeyId,
			secretAccessKey: this.s3Config.secretAccessKey,
		});

		const params: AWS.S3.DeleteObjectsRequest = {
			Bucket: this.s3Config.bucketName,
			Delete: {
				Objects: objects,
			},
		};

		const s3 = new AWSS3();

		const response = await s3
			.deleteObjects(params)
			.promise()
			.catch((err: AWS.AWSError) => {
				if (this._isDebug) {
					console.log(err);
				}
				return false;
			});

		if (response) {
			if (this._isDebug) {
				console.log('File(s) removed from S3.');
			}
			return response;
		} else {
			throw 'Error removing file(s)...';
		}
	}

	public static getObject(filePath: string, req?: Request) {
		AWS.config.update({
			accessKeyId: this.s3Config.accessKeyId,
			secretAccessKey: this.s3Config.secretAccessKey,
		});

		const s3 = new AWSS3();
		const awsReq: AWS.S3.GetObjectRequest = {
			Bucket: this.s3Config.bucketName,
			Key: filePath,
		};

		if (req?.headers?.range) {
			awsReq.Range = req.headers.range;
		}

		return s3.getObject(awsReq).createReadStream();
	}

	public static getObjectPromise(filePath: string) {
		AWS.config.update({
			accessKeyId: this.s3Config.accessKeyId,
			secretAccessKey: this.s3Config.secretAccessKey,
		});

		const s3 = new AWSS3();
		const awsReq: AWS.S3.GetObjectRequest = {
			Bucket: this.s3Config.bucketName,
			Key: filePath,
		};

		return s3.getObject(awsReq).promise();
	}

	public static async getContents(
		folderName: string | undefined,
		continuationToken: string | undefined,
	) {
		AWS.config.update({
			accessKeyId: this.s3Config.accessKeyId,
			secretAccessKey: this.s3Config.secretAccessKey,
		});

		if (!folderName) {
			folderName = 'uploads/';
		}

		const params: AWS.S3.ListObjectsV2Request = {
			Bucket: this.s3Config.bucketName,
			Prefix: folderName,
			ContinuationToken: continuationToken,
		};

		const s3 = new AWSS3();

		const response = await s3
			.listObjectsV2(params)
			.promise()
			.catch((err: AWS.AWSError) => {
				if (this._isDebug) {
					console.log(err);
				}
				return false;
			});

		if (response) {
			if (this._isDebug) {
				console.log('Content list retrieved.');
			}
			return response;
		} else {
			throw 'Error listing bucket contets...';
		}
	}

	private static generateFileName(originalName: string) {
		const segments = originalName.match(/(.*)\.(.*)$/);

		return uuid() + '.' + (segments ? segments[2] : '');
	}
}
