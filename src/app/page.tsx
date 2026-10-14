import { redirect } from 'next/navigation';

// Landing page is stashed at src/components/landing/LandingPage.tsx until launch.
export default function Home() {
  redirect('/login');
}
