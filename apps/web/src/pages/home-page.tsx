import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

export function HomePage() {
  const { data: session } = authClient.useSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {session?.user.name}</CardTitle>
        <CardDescription>
          Signed in as {session?.user.email} ({session?.user.role === 'ADMIN' ? 'Admin' : 'Agent'})
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
