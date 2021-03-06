import { Auth } from '@aws-amplify/auth';
import { Logger, isEmpty } from '@aws-amplify/core';
import { AuthState, ChallengeName, CognitoUserInterface, AuthStateHandler } from './types/auth-types';
import { dispatchToastHubEvent } from './helpers';
import { NO_AUTH_MODULE_FOUND } from '../common/constants';

const logger = new Logger('auth-helpers');

export async function checkContact(user: CognitoUserInterface, handleAuthStateChange: AuthStateHandler) {
  if (!Auth || typeof Auth.verifiedContact !== 'function') {
    throw new Error(NO_AUTH_MODULE_FOUND);
  }
  try {
    const data = await Auth.verifiedContact(user);
    if (!isEmpty(data.verified) || isEmpty(data.unverified)) {
      handleAuthStateChange(AuthState.SignedIn, user);
    } else {
      const newUser = Object.assign(user, data);
      handleAuthStateChange(AuthState.VerifyContact, newUser);
    }
  } catch (error) {
    dispatchToastHubEvent(error);
  }
}

export const handleSignIn = async (username: string, password: string, handleAuthStateChange: AuthStateHandler) => {
  if (!Auth || typeof Auth.signIn !== 'function') {
    throw new Error(NO_AUTH_MODULE_FOUND);
  }
  try {
    const user = await Auth.signIn(username, password);
    logger.debug(user);
    if (user.challengeName === ChallengeName.SMSMFA || user.challengeName === ChallengeName.SoftwareTokenMFA) {
      logger.debug('confirm user with ' + user.challengeName);
      handleAuthStateChange(AuthState.ConfirmSignIn, user);
    } else if (user.challengeName === ChallengeName.NewPasswordRequired) {
      logger.debug('require new password', user.challengeParam);
      handleAuthStateChange(AuthState.ResetPassword, user);
    } else if (user.challengeName === ChallengeName.MFASetup) {
      logger.debug('TOTP setup', user.challengeParam);
      handleAuthStateChange(AuthState.TOTPSetup, user);
    } else if (
      user.challengeName === ChallengeName.CustomChallenge &&
      user.challengeParam &&
      user.challengeParam.trigger === 'true'
    ) {
      logger.debug('custom challenge', user.challengeParam);
      handleAuthStateChange(AuthState.CustomConfirmSignIn, user);
    } else {
      await checkContact(user, handleAuthStateChange);
    }
  } catch (error) {
    dispatchToastHubEvent(error);
    if (error.code === 'UserNotConfirmedException') {
      logger.debug('the user is not confirmed');
      handleAuthStateChange(AuthState.ConfirmSignUp, { username });
    } else if (error.code === 'PasswordResetRequiredException') {
      logger.debug('the user requires a new password');
      handleAuthStateChange(AuthState.ForgotPassword, { username });
    }
  }
};
