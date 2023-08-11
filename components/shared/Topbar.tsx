import Link from "next/link";
import { SignedIn, SignOutButton, OrganizationSwitcher } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const Topbar = () => {
  const isUserLoggedIn = true;

  return (
    <nav className="topbar">
      <Link href="/" className="flex items-center gap-4">
        <img src="/assets/logo.svg" alt="logo" width={28} height={28} />
        <p className="text-heading2-semibold text-light-1 max-xs:hidden">
          Threads
        </p>
      </Link>

      <div className="flex items-center gap-1">
        <div className="block md:hidden">
          <SignedIn>
            <SignOutButton>
              <div className="flex cursor-pointer">
                <img
                  src="/assets/logout.svg"
                  alt="logout"
                  width={24}
                  height={24}
                />
              </div>
            </SignOutButton>
          </SignedIn>
        </div>

        <OrganizationSwitcher
          appearance={{
            baseTheme: dark,
            elements: {
              organizationSwitcherTrigger: "py-2 px-4",
            },
          }}
        />
      </div>
    </nav>
  );
};

export default Topbar;
