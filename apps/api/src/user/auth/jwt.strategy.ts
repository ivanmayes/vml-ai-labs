import { ExtractJwt, Strategy } from 'passport-jwt';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	private debug = process.env.DEBUG;

	constructor(private readonly authService: AuthService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: process.env.PUBLIC_KEY,
			passReqToCallback: true
		});
	}

	public async validate(req, payload: JwtPayload) {
		// We want to treat our tokens as expiring API keys that can be revoked.
		// Pull the token out of the request and pass it to auth validation
		// to make sure the user still has access with this token.
		const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
		let errorMessage;
		const user = await this.authService.validateUser(token, payload)
			.catch(err => {
				console.log(err);
				if(err.message) {
					errorMessage = err.message;
				}
				return false;
			});

		if(!user) {
			throw new UnauthorizedException(errorMessage);
		}

		return user;
	}
}
