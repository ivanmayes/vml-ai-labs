import { FraudPreventionCrypto } from './modules/crypto/crypto.module';
import { FraudPreventionForms } from './modules/forms/forms.module';

export class FraudPrevention {
	public static Crypto = FraudPreventionCrypto;
	public static Forms = FraudPreventionForms;
}