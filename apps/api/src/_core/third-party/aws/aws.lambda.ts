import AWS, { Lambda as AWSLambda } from 'aws-sdk'; 

export class Lambda {
	private static readonly isDebug = process.env.DEBUG || false;

	private static lambdaConfig = {
		queueURL: process.env.AWS_LAMBDA_QUEUE_URL,
		region: process.env.AWS_LAMBDA_REGION || process.env.AWS_REGION,
		accessKeyId: process.env.AWS_LAMBDA_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_LAMBDA_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
	};

	public static async submitRequest(functionName: string, payload: string) {
		if(process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			AWS.config.update({
				region: this.lambdaConfig.region,
				accessKeyId: this.lambdaConfig.accessKeyId,
				secretAccessKey: this.lambdaConfig.secretAccessKey
			});
		}

		const lambda = new AWSLambda();

		const response: AWS.Lambda.Types.InvocationResponse = await lambda
			.invoke({
				FunctionName: functionName,
				InvocationType: 'Event',
				Payload: payload
			})
			.promise()
			.catch(err => {
				if(this.isDebug) {
					console.log(err);
				}
				return null;
			});

		if(!response) {
			throw new Error(`Error calling lambda: ${functionName}.`);
		}

		return response.StatusCode;
	}
}