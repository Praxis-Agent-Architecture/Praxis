export const providerProfileRefs = {
  profileSetId: "auth.example.fullstack.providerProfiles",
  rawSecretsStoredHere: false,
  profiles: [
    {
      profileRef: "auth.profile.openai.responses.dev",
      provider: "openai",
      endpointFamily: "responses",
      carrierRef: "carrier.example.repoInspector.quick.standard",
      secretRef: "user-home:.rax/auth/openai/default",
    },
  ],
} as const;
