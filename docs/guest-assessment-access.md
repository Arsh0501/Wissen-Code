# Guest assessment entry

Guests keep one User record per normalized email. GuestAssessmentParticipation has a database unique constraint on (userId, assessmentId); because User.email is unique, this represents one email/assessment participation across all invitation links.

A guest without a session may join a different assessment through a valid invitation without a password or OTP. Admission, invitation redemption, and creation of the assessment-scoped login session are committed in one transaction. Requests for the same guest are serialized with a PostgreSQL row lock. A second admission to the same assessment is rejected, including through another link. An existing session for that assessment can continue; completed attempts and configured attempt limits are still enforced by the start endpoint.

Scoped guest sessions can access only their assessment, including result and attempt endpoints. Refreshing a token preserves its scope. A different assessment may have a separate session, so joining it does not invalidate a test already in progress elsewhere. Registered accounts continue to require normal sign-in. Existing legacy sessions retain their previous access until expiry.

No mailbox ownership verification is performed. Someone with a generic link can enter another person's email; personal recipient-bound invitations reduce accidental misuse but may be forwarded. This is the accepted no-OTP flow, not proof of email ownership.

## Deployment

Back up the production database, push these changes to the deployment repository/branch, rebuild the AWS images, and run the existing Compose migration/start process. The additive migration `20261102000000_guest_assessment_sessions` adds the session scope and participation table and backfills historical guest admissions from invitation redemptions and assessment attempts. No existing users or results are removed. Deploy the frontend wording change through Vercel as well. These changes have not been pushed or deployed automatically.

After a guest logs out or loses their assessment session, entering the same assessment again is blocked; this change does not add recovery. Another assessment can still be joined with the same email. Merely opening the invitation page does not create participation; clicking Continue does.
