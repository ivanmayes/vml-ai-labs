import {
	ClassConstructor,
	Type,
	TypeHelpOptions,
	TypeOptions
} from 'class-transformer';
import {
	registerDecorator,
	validate,
	ValidateNested,
	ValidationArguments,
	ValidationOptions,
	ValidatorConstraintInterface,
} from 'class-validator';

// Ref: https://github.com/typestack/class-validator/issues/1011

// taken from - import { applyDecorators } from '@nestjs/common';
function applyDecorators(
	...decorators: Array < PropertyDecorator >
) {
	return <TFunction extends Function, Y > (
		target: TFunction | object,
		propertyKey ? : string | symbol,
	) => {
		for (const decorator of decorators) {
			decorator(
				target,
				propertyKey,
			);
		}
	};
}

const TYPESCRIPT_DECORATE_DESIGN_TYPE = 'design:type';

class IsRecordConstraint implements ValidatorConstraintInterface {
	public async validate(value: any): Promise < boolean > {
		const validationResults = await Promise.all(Object.entries(value).map((entry) => validate(entry[1] as object)));
		return validationResults.every((p) => p.length <= 0);
	}

	public defaultMessage(args: ValidationArguments) {
		return `${args.property} error`;
	}
}

const validator = new IsRecordConstraint();

const IsRecordValidator =
	(validationOptions ? : ValidationOptions): PropertyDecorator =>
	(object: object, propertyName: string | symbol) => {
		registerDecorator({
			target: object.constructor,
			propertyName: propertyName as string,
			options: validationOptions,
			constraints: [],
			validator
		});
	};

export const IsRecord = <T extends object> (
	type: ClassConstructor <T> ,
	validationOptions ? : ValidationOptions,
	typeOptions ? : TypeOptions
): PropertyDecorator =>
	applyDecorators(
		ValidateNested(),
		IsRecordValidator(),
		Type((options ? : TypeHelpOptions) => {
			class RecordClass {}
			Object
				.entries(options?.object?.[options?.property])
				.forEach(([key]) => {
					const decorators = [
						ValidateNested(validationOptions),
						Type(() => type, typeOptions),
						Reflect.metadata(TYPESCRIPT_DECORATE_DESIGN_TYPE, Object)
					];
					Reflect.decorate(decorators, RecordClass.prototype, key, undefined);
				});
			return RecordClass;
		})
);
