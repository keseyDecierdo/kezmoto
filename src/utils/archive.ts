/* Archived chats (0039): a chat shows in the Archived tab only while no
   message is newer than the moment it was archived, so a new message
   brings it back to Active on its own. */

export const isArchivedThread = (
  thread: { updatedAt: string },
  archivedAt: string | null | undefined
): boolean => Boolean(archivedAt) && new Date(thread.updatedAt).getTime() <= new Date(archivedAt as string).getTime();
