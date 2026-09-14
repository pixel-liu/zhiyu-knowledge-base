"use client";

import { SignIn } from "@clerk/nextjs";

// Hidden owner login. Not linked anywhere; the owner navigates here directly.
// After sign-in the owner lands in the editor (where owner controls appear).
const AdminPage = () => {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <SignIn routing="hash" forceRedirectUrl="/documents" />
    </div>
  );
};

export default AdminPage;
