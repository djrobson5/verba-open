import { collection, getFirestore } from 'firebase/firestore';
import { getApp } from 'firebase/app';

export function getUserConversationsRef(userId: string) {
  const db = getFirestore(getApp());
  return collection(db, 'users', userId, 'conversations');
}
