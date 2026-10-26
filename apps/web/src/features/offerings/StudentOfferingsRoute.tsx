import { useAuth } from '@clerk/react';
import { useMemo } from 'react';
import { AuthGate } from '../auth';
import { createOfferingClient } from './client';
import { OfferingsPage } from './OfferingsPage';

/** Mount at /student/offerings inside the existing Clerk provider and shared shell. */
export function StudentOfferingsRoute({ apiBaseUrl = '' }: { apiBaseUrl?: string }) {
  const { getToken, userId, sessionId } = useAuth();
  const client = useMemo(() => createOfferingClient(getToken, apiBaseUrl), [getToken, apiBaseUrl]);
  return <AuthGate roles={['STUDENT']} requireProfile apiBaseUrl={apiBaseUrl} pathname="/student/offerings">
    <OfferingsPage key={[userId, sessionId].join('|')} client={client} />
  </AuthGate>;
}
