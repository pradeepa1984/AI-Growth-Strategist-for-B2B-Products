/**
 * AWS Cognito authentication helpers.
 *
 * Uses amazon-cognito-identity-js (no Amplify overhead).
 *
 * Exports:
 *   login(email, password)  → Promise<idToken string>
 *   logout()                → void
 *   getToken()              → string | null
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

const TOKEN_KEY = "cognito_id_token";

/**
 * Log in with email + password.
 * On success, stores the ID token in localStorage and returns it.
 */
export function login(email, password) {
  return new Promise((resolve, reject) => {
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess(result) {
        const idToken = result.getIdToken().getJwtToken();
        localStorage.setItem(TOKEN_KEY, idToken);
        resolve(idToken);
      },
      onFailure(err) {
        // Provide clean user-facing messages for common errors
        if (err.code === "UserNotFoundException" || err.code === "NotAuthorizedException") {
          reject(new Error("Incorrect email or password."));
        } else if (err.code === "UserNotConfirmedException") {
          reject(new Error("Please verify your email before logging in."));
        } else {
          reject(new Error(err.message || "Login failed."));
        }
      },
      // Handle the case where Cognito asks user to change password on first login
      newPasswordRequired(_userAttributes) {
        reject(new Error("You must set a new password. Contact your admin."));
      },
    });
  });
}

/**
 * Sign up a new user with email + password.
 * Cognito sends a verification email automatically.
 */
export function signUp(email, password) {
  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, [], null, (err, result) => {
      if (err) {
        if (err.code === "UsernameExistsException") {
          reject(new Error("An account with this email already exists."));
        } else if (err.code === "InvalidPasswordException") {
          reject(new Error("Password must be at least 8 characters with upper/lowercase and a number."));
        } else {
          reject(new Error(err.message || "Sign up failed."));
        }
        return;
      }
      resolve(result.user);
    });
  });
}

/**
 * Confirm signup with the 6-digit code sent to the user's email.
 */
export function confirmSignUp(email, code) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(new Error(err.message || "Confirmation failed."));
        return;
      }
      resolve();
    });
  });
}

/**
 * Send a password-reset OTP to the user's email.
 * Call this first, then confirmForgotPassword with the code.
 */
export function forgotPassword(email) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.forgotPassword({
      onSuccess() {
        resolve();
      },
      onFailure(err) {
        if (err.code === "UserNotFoundException") {
          reject(new Error("No account found with that email."));
        } else if (err.code === "LimitExceededException") {
          reject(new Error("Too many attempts. Please try again later."));
        } else {
          reject(new Error(err.message || "Failed to send reset code."));
        }
      },
    });
  });
}

/**
 * Complete the password reset using the OTP and a new password.
 */
export function confirmForgotPassword(email, code, newPassword) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess() {
        resolve();
      },
      onFailure(err) {
        if (err.code === "CodeMismatchException") {
          reject(new Error("Invalid verification code. Please try again."));
        } else if (err.code === "ExpiredCodeException") {
          reject(new Error("Code has expired. Please request a new one."));
        } else if (err.code === "InvalidPasswordException") {
          reject(new Error("Password must be at least 8 characters with upper/lowercase and a number."));
        } else {
          reject(new Error(err.message || "Password reset failed."));
        }
      },
    });
  });
}

/**
 * Log out the current user — clears token from localStorage.
 */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  const currentUser = userPool.getCurrentUser();
  if (currentUser) {
    currentUser.signOut();
  }
}

/**
 * Get the stored ID token (or null if not logged in).
 * Used by the API client to attach the Authorization header.
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Check if a user is currently logged in.
 */
export function isLoggedIn() {
  return !!getToken();
}
