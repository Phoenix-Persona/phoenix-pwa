export interface BuildPersonaProfileMetadataArgs {
  name: string;
  username?: string;
  displayName?: string;
  bio: string;
  pictureUrl?: string;
  lightningAddress?: string;
}

export function buildPersonaProfileMetadata(
  args: BuildPersonaProfileMetadataArgs,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    name: args.username ?? args.name,
    display_name: args.displayName ?? args.name,
    about: args.bio,
    picture: args.pictureUrl ?? "",
    bot: true,
  };
  if (args.lightningAddress) {
    metadata.lud16 = args.lightningAddress;
  }
  if (args.pictureUrl) {
    metadata.phoenix = {
      reference_image: args.pictureUrl,
      version: 1,
    };
  }
  return metadata;
}
