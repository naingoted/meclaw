type EnvMap = Record<string, string | undefined>;

const OWNER_EMAIL = "naingoted@gmail.com";

export function ownerContact(env: EnvMap = process.env): { email: string; github?: string } {
  const github = env.NEXT_PUBLIC_GITHUB_URL;
  return github ? { email: OWNER_EMAIL, github } : { email: OWNER_EMAIL };
}

export function scheduleCall(env: EnvMap = process.env): { url: string } {
  return { url: env.NEXT_PUBLIC_CAL_URL || "https://cal.com/tet-nai" };
}

export function showResume(): { path: string; description: string } {
  return {
    path: "/resume",
    description: "The resume is available for download at /resume. Offer this link to the visitor.",
  };
}

export function howThisWorks(): string {
  return (
    "meclaw is Thet Naing's personal bot. It answers questions about him grounded " +
    "in a curated knowledge corpus, and can share his resume, contact details, and " +
    "a scheduling link."
  );
}
