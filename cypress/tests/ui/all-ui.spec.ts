import { isMobile } from "../../support/utils";
import { User, Transaction } from "../../../src/models";

type NotificationsCtx = {
  userA: User;
  userB: User;
  userC: User;
};

describe("Notifications", function () {
  const ctx = {} as NotificationsCtx;

  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("GET", "/notifications*").as("getNotifications");
    cy.intercept("POST", "/transactions").as("createTransaction");
    cy.intercept("PATCH", "/notifications/*").as("updateNotification");
    cy.intercept("POST", "/comments/*").as("postComment");

    cy.database("filter", "users").then((users: User[]) => {
      ctx.userA = users[0];
      ctx.userB = users[1];
      ctx.userC = users[2];
    });
  });

  describe("notifications from user interactions", function () {
    it("User A likes a transaction of User B; User B gets notification that User A liked transaction ", function () {
      cy.loginByXstate(ctx.userA.username);
      cy.wait("@getNotifications");

      cy.database("find", "transactions", { senderId: ctx.userB.id }).then(
        (transaction: Transaction) => {
          cy.visit(`/transaction/${transaction.id}`);
        }
      );

      cy.log("🚩 Renders the notifications badge with count");
      cy.wait("@getNotifications")
        .its("response.body.results.length")
        .then((notificationCount) => {
          cy.getBySel("nav-top-notifications-count").should("have.text", `${notificationCount}`);
        });
      cy.visualSnapshot("Renders the notifications badge with count");

      const likesCountSelector = "[data-test*=transaction-like-count]";
      cy.contains(likesCountSelector, 0);
      cy.getBySelLike("like-button").click();
      // a successful "like" should disable the button and increment
      // the number of likes
      cy.getBySelLike("like-button").should("be.disabled");
      cy.contains(likesCountSelector, 1);
      cy.visualSnapshot("Like Count Incremented");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.wait("@getNotifications")
        .its("response.body.results.length")
        .as("preDismissedNotificationCount");

      cy.visit("/notifications");

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userA?.firstName)
        .and("contain", "liked");

      cy.log("🚩 Marks notification as read");
      cy.getBySelLike("notification-mark-read").first().click({ force: true });
      cy.wait("@updateNotification");

      cy.get("@preDismissedNotificationCount").then((count) => {
        cy.getBySelLike("notification-list-item").should("have.length.lessThan", Number(count));
      });
      cy.visualSnapshot("Notification count after notification dismissed");
    });

    it("User C likes a transaction between User A and User B; User A and User B get notifications that User C liked transaction", function () {
      cy.loginByXstate(ctx.userC.username);

      cy.database("find", "transactions", {
        senderId: ctx.userB.id,
        receiverId: ctx.userA.id,
      }).then((transaction: Transaction) => {
        cy.visit(`/transaction/${transaction.id}`);
      });

      const likesCountSelector = "[data-test*=transaction-like-count]";
      cy.contains(likesCountSelector, 0);
      cy.getBySelLike("like-button").click();
      cy.getBySelLike("like-button").should("be.disabled");
      cy.contains(likesCountSelector, 1);
      cy.visualSnapshot("Like Count Incremented");

      cy.switchUserByXstate(ctx.userA.username);
      cy.visualSnapshot(`Switch to User ${ctx.userA.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.location("pathname").should("equal", "/notifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "liked");
      cy.visualSnapshot("User A Notified of User B Like");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "liked");
      cy.visualSnapshot("User B Notified of User C Like");
    });

    it("User A comments on a transaction of User B; User B gets notification that User A commented on their transaction", function () {
      cy.loginByXstate(ctx.userA.username);
      cy.visualSnapshot("Logged in as user A");

      cy.database("find", "transactions", { senderId: ctx.userB.id }).then(
        (transaction: Transaction) => {
          cy.visit(`/transaction/${transaction.id}`);
        }
      );

      cy.getBySelLike("comment-input").type("Thank You{enter}");

      cy.wait("@postComment");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userA?.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User A Notified of User B Comment");
    });

    it("User C comments on a transaction between User A and User B; User A and B get notifications that User C commented on their transaction", function () {
      cy.loginByXstate(ctx.userC.username);

      cy.database("find", "transactions", {
        senderId: ctx.userB.id,
        receiverId: ctx.userA.id,
      }).then((transaction: Transaction) => {
        cy.visit(`/transaction/${transaction.id}`);
      });

      cy.getBySelLike("comment-input").type("Thank You{enter}");

      cy.wait("@postComment");

      cy.switchUserByXstate(ctx.userA.username);
      cy.visualSnapshot("Switch to User A");
      cy.visualSnapshot(`Switch to User ${ctx.userA.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User A Notified of User C Comment");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();
      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User B Notified of User C Comment");
    });

    it("User A sends a payment to User B", function () {
      cy.loginByXstate(ctx.userA.username);

      cy.getBySelLike("new-transaction").click();
      cy.createTransaction({
        transactionType: "payment",
        amount: 30,
        description: "🍕Pizza",
        sender: ctx.userA,
        receiver: ctx.userB,
      });
      cy.wait("@createTransaction");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();
      cy.visualSnapshot("Navigate to Notifications");

      cy.getBySelLike("notification-list-item")
        .first()
        .should("contain", ctx.userB.firstName)
        .and("contain", "received payment");
      cy.visualSnapshot("User B Notified of Payment");
    });

    it("User A sends a payment request to User C", function () {
      cy.loginByXstate(ctx.userA.username);

      cy.getBySelLike("new-transaction").click();
      cy.createTransaction({
        transactionType: "request",
        amount: 300,
        description: "🛫🛬 Airfare",
        sender: ctx.userA,
        receiver: ctx.userC,
      });
      cy.wait("@createTransaction");

      cy.switchUserByXstate(ctx.userC.username);
      cy.visualSnapshot(`Switch to User ${ctx.userC.username}`);

      cy.getBySelLike("notifications-link").click();
      cy.getBySelLike("notification-list-item")
        .should("contain", ctx.userA.firstName)
        .and("contain", "requested payment");
      cy.visualSnapshot("User C Notified of Request from User A");
    });
  });

  it("renders an empty notifications state", function () {
    cy.intercept("GET", "/notifications", []).as("notifications");

    cy.loginByXstate(ctx.userA.username);

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }
    cy.getBySel("sidenav-notifications").click();
    cy.location("pathname").should("equal", "/notifications");
    cy.getBySel("notification-list").should("not.exist");
    cy.getBySel("empty-list-header").should("contain", "No Notifications");
    cy.visualSnapshot("No Notifications");
  });
});

import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

const apiGraphQL = `${Cypress.env("apiUrl")}/graphql`;

describe("User Sign-up and Login", function () {
  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("POST", "/users").as("signup");
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;

      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {
        req.alias = "gqlCreateBankAccountMutation";
      }
    });
  });

  it("should redirect unauthenticated user to signin page", function () {
    cy.visit("/personal");
    cy.location("pathname").should("equal", "/signin");
    cy.visualSnapshot("Redirect to SignIn");
  });

  it("should redirect to the home page after login", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "s3cret", { rememberUser: true });
    });
    cy.location("pathname").should("equal", "/");
  });

  it("should remember a user for 30 days after login", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "s3cret", { rememberUser: true });
    });

    // Verify Session Cookie
    cy.getCookie("connect.sid").should("have.property", "expiry");

    // Logout User
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }
    cy.getBySel("sidenav-signout").click();
    cy.location("pathname").should("eq", "/signin");
    cy.visualSnapshot("Redirect to SignIn");
  });

  it("should allow a visitor to sign-up, login, and logout", function () {
    const userInfo = {
      firstName: "Bob",
      lastName: "Ross",
      username: "PainterJoy90",
      password: "s3cret",
    };

    // Sign-up User
    cy.visit("/");

    cy.getBySel("signup").click();
    cy.getBySel("signup-title").should("be.visible").and("contain", "Sign Up");
    cy.visualSnapshot("Sign Up Title");

    cy.getBySel("signup-first-name").type(userInfo.firstName);
    cy.getBySel("signup-last-name").type(userInfo.lastName);
    cy.getBySel("signup-username").type(userInfo.username);
    cy.getBySel("signup-password").type(userInfo.password);
    cy.getBySel("signup-confirmPassword").type(userInfo.password);
    cy.visualSnapshot("About to Sign Up");
    cy.getBySel("signup-submit").click();
    cy.wait("@signup");

    // Login User
    cy.login(userInfo.username, userInfo.password);

    // Onboarding
    cy.getBySel("user-onboarding-dialog").should("be.visible");
    cy.getBySel("list-skeleton").should("not.exist");
    cy.getBySel("nav-top-notifications-count").should("exist");
    cy.visualSnapshot("User Onboarding Dialog");
    cy.getBySel("user-onboarding-next").click();

    cy.getBySel("user-onboarding-dialog-title").should("contain", "Create Bank Account");

    cy.getBySelLike("bankName-input").type("The Best Bank");
    cy.getBySelLike("accountNumber-input").type("123456789");
    cy.getBySelLike("routingNumber-input").type("987654321");
    cy.visualSnapshot("About to complete User Onboarding");
    cy.getBySelLike("submit").click();

    cy.wait("@gqlCreateBankAccountMutation");

    cy.getBySel("user-onboarding-dialog-title").should("contain", "Finished");
    cy.getBySel("user-onboarding-dialog-content").should("contain", "You're all set!");
    cy.visualSnapshot("Finished User Onboarding");
    cy.getBySel("user-onboarding-next").click();

    cy.getBySel("transaction-list").should("be.visible");
    cy.visualSnapshot("Transaction List is visible after User Onboarding");

    // Logout User
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }
    cy.getBySel("sidenav-signout").click();
    cy.location("pathname").should("eq", "/signin");
    cy.visualSnapshot("Redirect to SignIn");
  });

  it("should display login errors", function () {
    cy.visit("/");

    cy.getBySel("signin-username").type("User").find("input").clear().blur();
    cy.get("#username-helper-text").should("be.visible").and("contain", "Username is required");
    cy.visualSnapshot("Display Username is Required Error");

    cy.getBySel("signin-password").type("abc").find("input").blur();
    cy.get("#password-helper-text")
      .should("be.visible")
      .and("contain", "Password must contain at least 4 characters");
    cy.visualSnapshot("Display Password Error");

    cy.getBySel("signin-submit").should("be.disabled");
    cy.visualSnapshot("Sign In Submit Disabled");
  });

  it("should display signup errors", function () {
    cy.intercept("GET", "/signup");

    cy.visit("/signup");

    cy.getBySel("signup-first-name").type("First").find("input").clear().blur();
    cy.get("#firstName-helper-text").should("be.visible").and("contain", "First Name is required");

    cy.getBySel("signup-last-name").type("Last").find("input").clear().blur();
    cy.get("#lastName-helper-text").should("be.visible").and("contain", "Last Name is required");

    cy.getBySel("signup-username").type("User").find("input").clear().blur();
    cy.get("#username-helper-text").should("be.visible").and("contain", "Username is required");

    cy.getBySel("signup-password").type("password").find("input").clear().blur();
    cy.get("#password-helper-text").should("be.visible").and("contain", "Enter your password");

    cy.getBySel("signup-confirmPassword").type("DIFFERENT PASSWORD").find("input").blur();
    cy.get("#confirmPassword-helper-text")
      .should("be.visible")
      .and("contain", "Password does not match");
    cy.visualSnapshot("Display Sign Up Required Errors");

    cy.getBySel("signup-submit").should("be.disabled");
    cy.visualSnapshot("Sign Up Submit Disabled");
  });

  it("should error for an invalid user", function () {
    cy.login("invalidUserName", "invalidPa$$word");

    cy.getBySel("signin-error")
      .should("be.visible")
      .and("have.text", "Username or password is invalid");
    cy.visualSnapshot("Sign In, Invalid Username and Password, Username or Password is Invalid");
  });

  it("should error for an invalid password for existing user", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "INVALID");
    });

    cy.getBySel("signin-error")
      .should("be.visible")
      .and("have.text", "Username or password is invalid");
    cy.visualSnapshot("Sign In, Invalid Username, Username or Password is Invalid");
  });
});

import Dinero from "dinero.js";
import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

type NewTransactionTestCtx = {
  allUsers?: User[];
  user?: User;
  contact?: User;
};

describe("New Transaction", function () {
  const ctx: NewTransactionTestCtx = {};

  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("GET", "/users*").as("allUsers");

    cy.intercept("GET", "/users/search*").as("usersSearch");

    cy.intercept("POST", "/transactions").as("createTransaction");

    cy.intercept("GET", "/notifications").as("notifications");
    cy.intercept("GET", "/transactions/public").as("publicTransactions");
    cy.intercept("GET", "/transactions").as("personalTransactions");
    cy.intercept("PATCH", "/transactions/*").as("updateTransaction");

    cy.database("filter", "users").then((users: User[]) => {
      ctx.allUsers = users;
      ctx.user = users[0];
      ctx.contact = users[1];

      return cy.loginByXstate(ctx.user.username);
    });
  });

  it("navigates to the new transaction form, selects a user and submits a transaction payment", function () {
    const payment = {
      amount: "35",
      description: "Sushi dinner 🍣",
    };

    cy.getBySelLike("new-transaction").click();
    cy.wait("@allUsers");

    cy.getBySel("user-list-search-input").type(ctx.contact!.firstName, { force: true });
    cy.wait("@usersSearch");
    cy.visualSnapshot("User Search First Name Input");

    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });
    cy.visualSnapshot("User Search First Name List Item");

    cy.getBySelLike("amount-input").type(payment.amount);
    cy.getBySelLike("description-input").type(payment.description);
    cy.visualSnapshot("Amount and Description Input");
    cy.getBySelLike("submit-payment").click();
    cy.wait(["@createTransaction", "@getUserProfile"]);
    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("have.text", "Transaction Submitted!");

    const updatedAccountBalance = Dinero({
      amount: ctx.user!.balance - parseInt(payment.amount) * 100,
    }).toFormat();

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Updated User Balance");

    if (isMobile()) {
      cy.get(".MuiBackdrop-root").click({ force: true });
    }

    cy.getBySelLike("create-another-transaction").click();
    cy.getBySel("app-name-logo").find("a").click();
    cy.getBySelLike("personal-tab").click().should("have.class", "Mui-selected");
    cy.wait("@personalTransactions");

    cy.getBySel("transaction-list").first().should("contain", payment.description);

    cy.database("find", "users", { id: ctx.contact!.id })
      .its("balance")
      .should("equal", ctx.contact!.balance + parseInt(payment.amount) * 100);
    cy.getBySel("alert-bar-success").should("not.exist");
    cy.visualSnapshot("Personal List Validate Transaction in List");
  });

  it("navigates to the new transaction form, selects a user and submits a transaction request", function () {
    const request = {
      amount: "95",
      description: "Fancy Hotel 🏨",
    };

    cy.getBySelLike("new-transaction").click();
    cy.wait("@allUsers");

    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });
    cy.visualSnapshot("User Search First Name Input");

    cy.getBySelLike("amount-input").type(request.amount);
    cy.getBySelLike("description-input").type(request.description);
    cy.visualSnapshot("Amount and Description Input");
    cy.getBySelLike("submit-request").click();
    cy.wait("@createTransaction");
    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("have.text", "Transaction Submitted!");
    cy.visualSnapshot("Transaction Request Submitted Notification");

    cy.getBySelLike("return-to-transactions").click();
    cy.getBySelLike("personal-tab").click().should("have.class", "Mui-selected");

    cy.getBySelLike("transaction-item").should("contain", request.description);
    cy.visualSnapshot("Transaction Item Description in List");
  });

  it("displays new transaction errors", function () {
    cy.getBySelLike("new-transaction").click();
    cy.wait("@allUsers");

    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });

    cy.getBySelLike("amount-input").type("43").find("input").clear().blur();
    cy.get("#transaction-create-amount-input-helper-text")
      .should("be.visible")
      .and("contain", "Please enter a valid amount");

    cy.getBySelLike("description-input").type("Fun").find("input").clear().blur();
    cy.get("#transaction-create-description-input-helper-text")
      .should("be.visible")
      .and("contain", "Please enter a note");

    cy.getBySelLike("submit-request").should("be.disabled");
    cy.getBySelLike("submit-payment").should("be.disabled");
    cy.visualSnapshot("New Transaction Errors with Submit Payment/Request Buttons Disabled");
  });

  it("submits a transaction payment and verifies the deposit for the receiver", function () {
    cy.getBySel("nav-top-new-transaction").click();

    const transactionPayload = {
      transactionType: "payment",
      amount: 25,
      description: "Indian Food",
      sender: ctx.user,
      receiver: ctx.contact,
    };

    // first let's grab the current balance from the UI
    let startBalance: string;
    if (!isMobile()) {
      // only check the balance display in desktop resolution
      // as it is NOT shown on mobile screen
      cy.get("[data-test=sidenav-user-balance]")
        .invoke("text")
        .then((x) => {
          startBalance = x; // something like "$1,484.81"
          expect(startBalance).to.match(/\$\d/);
        });
    }

    cy.createTransaction(transactionPayload);
    cy.wait("@createTransaction");
    cy.getBySel("new-transaction-create-another-transaction").should("be.visible");

    if (!isMobile()) {
      // make sure the new balance is displayed
      cy.get("[data-test=sidenav-user-balance]").should(($el) => {
        // here we only make sure the text has changed
        // we could also convert the balance to actual number
        // and confirm the new balance is the start balance - amount
        expect($el.text()).to.not.equal(startBalance);
      });
    }
    cy.visualSnapshot("Transaction Payment Submitted Notification");

    cy.switchUserByXstate(ctx.contact!.username);

    const updatedAccountBalance = Dinero({
      amount: ctx.contact!.balance + transactionPayload.amount * 100,
    }).toFormat();

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Verify Updated Sender Account Balance");
  });

  it("submits a transaction request and accepts the request for the receiver", function () {
    const transactionPayload = {
      transactionType: "request",
      amount: 100,
      description: "Fancy Hotel",
      sender: ctx.user,
      receiver: ctx.contact,
    };

    cy.getBySelLike("new-transaction").click();
    cy.createTransaction(transactionPayload);
    cy.wait("@createTransaction");
    cy.getBySel("new-transaction-create-another-transaction").should("be.visible");
    cy.visualSnapshot("receiver - Transaction Payment Submitted Notification");

    cy.switchUserByXstate(ctx.contact!.username);

    cy.getBySelLike("personal-tab").click();

    cy.wait("@personalTransactions");

    cy.getBySelLike("transaction-item")
      .first()
      .should("contain", transactionPayload.description)
      .click({ force: true });
    cy.getBySel("transaction-detail-header").should("exist");
    cy.visualSnapshot("Navigate to Transaction Item");

    cy.getBySelLike("accept-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("eq", 204);
    cy.getBySelLike("transaction-detail-header").should("be.visible");
    cy.getBySelLike("transaction-amount").should("be.visible");
    cy.getBySelLike("sender-avatar").should("be.visible");
    cy.getBySelLike("receiver-avatar").should("be.visible");
    cy.getBySelLike("transaction-description").should("be.visible");
    cy.visualSnapshot("Accept Transaction Request");

    cy.switchUserByXstate(ctx.user!.username);

    const updatedAccountBalance = Dinero({
      amount: ctx.user!.balance + transactionPayload.amount * 100,
    }).toFormat();

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Verify Updated Sender Account Balance");
  });

  context("searches for a user by attribute", function () {
    const searchAttrs: (keyof User)[] = [
      "firstName",
      "lastName",
      "username",
      "email",
      "phoneNumber",
    ];

    beforeEach(function () {
      cy.getBySelLike("new-transaction").click();
      cy.wait("@allUsers");
    });

    searchAttrs.forEach((attr: keyof User) => {
      it(attr, function () {
        const targetUser = ctx.allUsers![2];

        cy.log(`Searching by **${attr}**`);
        cy.getBySel("user-list-search-input").type(targetUser[attr] as string, { force: true });
        cy.wait("@usersSearch")
          // make sure the backend returns some results
          .its("response.body.results")
          .should("have.length.gt", 0)
          .its("length")
          .then((resultsN) => {
            cy.getBySelLike("user-list-item")
              // make sure the list of results is fully updated
              // and shows the number of results returned from the backend
              .should("have.length", resultsN)
              .first()
              .contains(targetUser[attr] as string);
          });

        cy.visualSnapshot(`User List for Search: ${attr} = ${targetUser[attr]}`);

        cy.focused().clear();
        cy.getBySel("users-list").should("be.empty");
        cy.visualSnapshot("User List Clear Search");
      });
    });
  });
});

import Dinero from "dinero.js";
import {
  User,
  Transaction,
  TransactionRequestStatus,
  TransactionResponseItem,
  Contact,
  TransactionStatus,
} from "../../../src/models";
import { addDays, isWithinInterval, startOfDay } from "date-fns";
import { startOfDayUTC, endOfDayUTC } from "../../../src/utils/transactionUtils";
import { isMobile } from "../../support/utils";

const { _ } = Cypress;

type TransactionFeedsCtx = {
  allUsers?: User[];
  user?: User;
  contactIds?: string[];
};

describe("Transaction Feed", function () {
  const ctx: TransactionFeedsCtx = {};

  const feedViews = {
    public: {
      tab: "public-tab",
      tabLabel: "everyone",
      routeAlias: "publicTransactions",
      service: "publicTransactionService",
    },
    contacts: {
      tab: "contacts-tab",
      tabLabel: "friends",
      routeAlias: "contactsTransactions",
      service: "contactTransactionService",
    },
    personal: {
      tab: "personal-tab",
      tabLabel: "mine",
      routeAlias: "personalTransactions",
      service: "personalTransactionService",
    },
  };

  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("GET", "/notifications").as("notifications");
    cy.intercept("GET", "/transactions*").as(feedViews.personal.routeAlias);
    cy.intercept("GET", "/transactions/public*").as(feedViews.public.routeAlias);
    cy.intercept("GET", "/transactions/contacts*").as(feedViews.contacts.routeAlias);

    cy.database("filter", "users").then((users: User[]) => {
      ctx.user = users[0];
      ctx.allUsers = users;

      cy.loginByXstate(ctx.user.username);
    });
  });
  describe("app layout and responsiveness", function () {
    it("toggles the navigation drawer", function () {
      cy.wait("@notifications");
      cy.wait("@publicTransactions");
      if (isMobile()) {
        cy.getBySel("sidenav-home").should("not.exist");
        cy.visualSnapshot("Mobile Initial Side Navigation Not Visible");
        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").should("be.visible");
        cy.visualSnapshot("Mobile Toggle Side Navigation Visible");
        cy.get(".MuiBackdrop-root").click({ force: true });
        cy.getBySel("sidenav-home").should("not.exist");
        cy.visualSnapshot("Mobile Home Link Side Navigation Not Visible");

        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").click().should("not.exist");
        cy.visualSnapshot("Mobile Toggle Side Navigation Not Visible");
      } else {
        cy.getBySel("sidenav-home").should("be.visible");
        cy.visualSnapshot("Desktop Side Navigation Visible");
        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").should("not.be.visible");
        cy.visualSnapshot("Desktop Side Navigation Not Visible");
      }
    });
  });

  describe("renders and paginates all transaction feeds", function () {
    it("renders transactions item variations in feed", function () {
      cy.intercept("GET", "/transactions/public*", {
        headers: {
          "X-Powered-By": "Express",
          Date: new Date().toString(),
        },
        fixture: "public-transactions.json",
      }).as("mockedPublicTransactions");

      // Visit page again to trigger call to /transactions/public
      cy.visit("/");

      cy.wait("@notifications");
      cy.wait("@mockedPublicTransactions")
        .its("response.body.results")
        .then((transactions) => {
          const getTransactionFromEl = ($el: JQuery<Element>): TransactionResponseItem => {
            const transactionId = $el.data("test").split("transaction-item-")[1];
            return _.find(transactions, (transaction) => {
              return transaction.id === transactionId;
            })!;
          };

          cy.log("🚩Testing a paid payment transaction item");
          cy.contains("[data-test*='transaction-item']", "paid").within(($el) => {
            const transaction = getTransactionFromEl($el);
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            expect([TransactionStatus.pending, TransactionStatus.complete]).to.include(
              transaction.status
            );

            expect(transaction.requestStatus).to.be.empty;

            cy.getBySelLike("like-count").should("have.text", `${transaction.likes.length}`);
            cy.getBySelLike("comment-count").should("have.text", `${transaction.comments.length}`);

            cy.getBySelLike("sender").should("contain", transaction.senderName);
            cy.getBySelLike("receiver").should("contain", transaction.receiverName);

            cy.getBySelLike("amount")
              .should("contain", `-${formattedAmount}`)
              .should("have.css", "color", "rgb(255, 0, 0)");
          });

          cy.log("🚩Testing a charged payment transaction item");
          cy.contains("[data-test*='transaction-item']", "charged").within(($el) => {
            const transaction = getTransactionFromEl($el);
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            expect(TransactionStatus.complete).to.equal(transaction.status);

            expect(transaction.requestStatus).to.equal(TransactionRequestStatus.accepted);

            cy.getBySelLike("amount")
              .should("contain", `+${formattedAmount}`)
              .should("have.css", "color", "rgb(76, 175, 80)");
          });

          cy.log("🚩Testing a requested payment transaction item");
          cy.contains("[data-test*='transaction-item']", "requested").within(($el) => {
            const transaction = getTransactionFromEl($el);
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            expect([TransactionStatus.pending, TransactionStatus.complete]).to.include(
              transaction.status
            );
            expect([
              TransactionRequestStatus.pending,
              TransactionRequestStatus.rejected,
            ]).to.include(transaction.requestStatus);

            cy.getBySelLike("amount")
              .should("contain", `+${formattedAmount}`)
              .should("have.css", "color", "rgb(76, 175, 80)");
          });
          cy.visualSnapshot("Transaction Item");
        });
    });

    _.each(feedViews, (feed, feedName) => {
      it(`paginates ${feedName} transaction feed`, function () {
        cy.getBySelLike(feed.tab)
          .click()
          .should("have.class", "Mui-selected")
          .contains(feed.tabLabel, { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.getBySel("list-skeleton").should("not.exist");
        cy.visualSnapshot(`Paginate ${feedName}`);

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body.results")
          .should("have.length", Cypress.env("paginationPageSize"));

        // Temporary fix: https://github.com/cypress-io/cypress-realworld-app/issues/338
        if (isMobile()) {
          cy.wait(10);
        }

        cy.log("📃 Scroll to next page");
        cy.getBySel("transaction-list").children().scrollTo("bottom");

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body")
          .then(({ results, pageData }) => {
            expect(results).have.length(Cypress.env("paginationPageSize"));
            expect(pageData.page).to.equal(2);
            cy.visualSnapshot(`Paginate ${feedName} Next Page`);
            cy.nextTransactionFeedPage(feed.service, pageData.totalPages);
          });

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body")
          .then(({ results, pageData }) => {
            expect(results).to.have.length.least(1);
            expect(pageData.page).to.equal(pageData.totalPages);
            expect(pageData.hasNextPages).to.equal(false);
            cy.visualSnapshot(`Paginate ${feedName} Last Page`);
          });
      });
    });
  });

  describe("filters transaction feeds by date range", function () {
    if (isMobile()) {
      it("closes date range picker modal", () => {
        cy.getBySelLike("filter-date-range-button").click({ force: true });
        cy.get(".Cal__Header__root").should("be.visible");
        cy.visualSnapshot("Mobile Open Date Range Picker");
        cy.getBySel("date-range-filter-drawer-close").click();
        cy.get(".Cal__Header__root").should("not.exist");
        cy.visualSnapshot("Mobile Close Date Range Picker");
      });
    }

    _.each(feedViews, (feed, feedName) => {
      it(`filters ${feedName} transaction feed by date range`, function () {
        cy.database("find", "transactions").then((transaction: Transaction) => {
          const dateRangeStart = startOfDay(new Date(transaction.createdAt));
          const dateRangeEnd = endOfDayUTC(addDays(dateRangeStart, 1));

          cy.getBySelLike(feed.tab).click().should("have.class", "Mui-selected");

          cy.wait(`@${feed.routeAlias}`).its("response.body.results").as("unfilteredResults");

          cy.pickDateRange(dateRangeStart, dateRangeEnd);

          cy.wait(`@${feed.routeAlias}`)
            .its("response.body.results")
            .then((transactions: Transaction[]) => {
              cy.getBySelLike("transaction-item").should("have.length", transactions.length);

              transactions.forEach(({ createdAt }) => {
                const createdAtDate = startOfDayUTC(new Date(createdAt));

                expect(
                  isWithinInterval(createdAtDate, {
                    start: startOfDayUTC(dateRangeStart),
                    end: dateRangeEnd,
                  }),
                  `transaction created date (${createdAtDate.toISOString()}) 
                  is within ${dateRangeStart.toISOString()} 
                  and ${dateRangeEnd.toISOString()}`
                ).to.equal(true);
              });

              cy.visualSnapshot("Date Range Filtered Transactions");
            });

          cy.log("Clearing date range filter. Data set should revert");
          cy.getBySelLike("filter-date-clear-button").click({
            force: true,
          });
          cy.getBySelLike("filter-date-range-button").should("contain", "ALL");

          cy.get("@unfilteredResults").then((unfilteredResults) => {
            cy.wait(`@${feed.routeAlias}`)
              .its("response.body.results")
              .should("deep.equal", unfilteredResults);
            cy.visualSnapshot("Unfiltered Transactions");
          });
        });
      });

      it(`does not show ${feedName} transactions for out of range date limits`, function () {
        const dateRangeStart = startOfDay(new Date(2014, 1, 1));
        const dateRangeEnd = endOfDayUTC(addDays(dateRangeStart, 1));

        cy.getBySelLike(feed.tab).click();
        cy.wait(`@${feed.routeAlias}`);

        cy.pickDateRange(dateRangeStart, dateRangeEnd);
        cy.wait(`@${feed.routeAlias}`);

        cy.getBySelLike("transaction-item").should("have.length", 0);
        cy.getBySel("empty-list-header").should("contain", "No Transactions");
        cy.getBySelLike("empty-create-transaction-button")
          .should("have.attr", "href", "/transaction/new")
          .contains("create a transaction", { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.visualSnapshot("No Transactions");
      });
    });
  });

  describe("filters transaction feeds by amount range", function () {
    const dollarAmountRange = {
      min: 200,
      max: 800,
    };

    _.each(feedViews, (feed, feedName) => {
      it(`filters ${feedName} transaction feed by amount range`, function () {
        cy.getBySelLike(feed.tab).click({ force: true }).should("have.class", "Mui-selected");

        cy.wait(`@${feed.routeAlias}`).its("response.body.results").as("unfilteredResults");

        cy.setTransactionAmountRange(dollarAmountRange.min, dollarAmountRange.max);

        cy.getBySelLike("filter-amount-range-text").should(
          "contain",
          `$${dollarAmountRange.min} - $${dollarAmountRange.max}`
        );

        // @ts-ignore
        cy.wait(`@${feed.routeAlias}`).then(({ response: { body, url } }) => {
          const transactions = body.results as TransactionResponseItem[];
          const urlParams = new URLSearchParams(_.last(url.split("?")));

          const rawAmountMin = dollarAmountRange.min * 100;
          const rawAmountMax = dollarAmountRange.max * 100;

          expect(urlParams.get("amountMin")).to.equal(`${rawAmountMin}`);
          expect(urlParams.get("amountMax")).to.equal(`${rawAmountMax}`);

          cy.visualSnapshot("Amount Range Filtered Transactions");
          transactions.forEach(({ amount }) => {
            expect(amount).to.be.within(rawAmountMin, rawAmountMax);
          });
        });

        cy.getBySelLike("amount-clear-button").click();

        if (isMobile()) {
          cy.getBySelLike("amount-range-filter-drawer-close").click();
          cy.getBySel("amount-range-filter-drawer").should("not.exist");
        } else {
          cy.getBySel("transaction-list-filter-amount-clear-button").click();
          cy.getBySel("main").scrollTo("top");
          cy.getBySel("transaction-list-filter-date-range-button").click({ force: true });
          cy.getBySel("transaction-list-filter-amount-range").should("not.be.visible");
        }

        cy.get("@unfilteredResults").then((unfilteredResults) => {
          cy.wait(`@${feed.routeAlias}`)
            .its("response.body.results")
            .should("deep.equal", unfilteredResults);
          cy.visualSnapshot("Unfiltered Transactions");
        });
      });

      it(`does not show ${feedName} transactions for out of range amount limits`, function () {
        cy.getBySelLike(feed.tab).click();
        cy.wait(`@${feed.routeAlias}`);

        cy.setTransactionAmountRange(550, 1000);
        cy.getBySelLike("filter-amount-range-text").should("contain", "$550 - $1,000");
        cy.wait(`@${feed.routeAlias}`);

        cy.getBySelLike("transaction-item").should("have.length", 0);
        cy.getBySel("empty-list-header").should("contain", "No Transactions");
        cy.getBySelLike("empty-create-transaction-button")
          .should("have.attr", "href", "/transaction/new")
          .contains("create a transaction", { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.visualSnapshot("No Transactions");
      });
    });
  });

  describe("Feed Item Visibility", () => {
    it("mine feed only shows personal transactions", function () {
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      cy.getBySelLike(feedViews.personal.tab).click();

      cy.wait("@personalTransactions")
        .its("response.body.results")
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];
          expect(transactionParticipants).to.include(ctx.user!.id);
        });
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("Personal Transactions");
    });

    it("first five items belong to contacts in public feed", function () {
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      cy.wait("@publicTransactions")
        .its("response.body.results")
        .invoke("slice", 0, 5)
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];

          const contactsInTransaction = _.intersection(transactionParticipants, ctx.contactIds!);
          const message = `"${contactsInTransaction}" are contacts of ${ctx.user!.id}`;
          expect(contactsInTransaction, message).to.not.be.empty;
        });
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("First 5 Transaction Items belong to contacts");
    });

    it("friends feed only shows contact transactions", function () {
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      cy.getBySelLike(feedViews.contacts.tab).click();

      cy.wait("@contactsTransactions")
        .its("response.body.results")
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];

          const contactsInTransaction = _.intersection(ctx.contactIds!, transactionParticipants);

          const message = `"${contactsInTransaction}" are contacts of ${ctx.user!.id}`;
          expect(contactsInTransaction, message).to.not.be.empty;
        });
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("Friends Feed only shows contacts transactions");
    });
  });
});

import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

describe("User Settings", function () {
  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("PATCH", "/users/*").as("updateUser");
    cy.intercept("GET", "/notifications*").as("getNotifications");

    cy.database("find", "users").then((user: User) => {
      cy.loginByXstate(user.username);
    });

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-user-settings").click();
  });

  it("renders the user settings form", function () {
    cy.wait("@getNotifications");
    cy.getBySel("user-settings-form").should("be.visible");
    cy.location("pathname").should("include", "/user/settings");

    cy.visualSnapshot("User Settings Form");
  });

  it("should display user setting form errors", function () {
    ["first", "last"].forEach((field) => {
      cy.getBySelLike(`${field}Name-input`).type("Abc").clear().blur();
      cy.get(`#user-settings-${field}Name-input-helper-text`)
        .should("be.visible")
        .and("contain", `Enter a ${field} name`);
    });

    cy.getBySelLike("email-input").type("abc").clear().blur();
    cy.get("#user-settings-email-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter an email address");

    cy.getBySelLike("email-input").type("abc@bob.").blur();
    cy.get("#user-settings-email-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain a valid email address");

    cy.getBySelLike("phoneNumber-input").type("abc").clear().blur();
    cy.get("#user-settings-phoneNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter a phone number");

    cy.getBySelLike("phoneNumber-input").type("615-555-").blur();
    cy.get("#user-settings-phoneNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Phone number is not valid");

    cy.getBySelLike("submit").should("be.disabled");
    cy.visualSnapshot("User Settings Form Errors and Submit Disabled");
  });

  it("updates first name, last name, email and phone number", function () {
    cy.getBySelLike("firstName").clear().type("New First Name");
    cy.getBySelLike("lastName").clear().type("New Last Name");
    cy.getBySelLike("email").clear().type("email@email.com");
    cy.getBySelLike("phoneNumber-input").clear().type("6155551212").blur();

    cy.getBySelLike("submit").should("not.be.disabled");
    cy.getBySelLike("submit").click();

    cy.wait("@updateUser").its("response.statusCode").should("equal", 204);

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-user-full-name").should("contain", "New First Name");
    cy.visualSnapshot("User Settings Update Profile");
  });
});

import { User, Transaction } from "../../../src/models";

type NewTransactionCtx = {
  transactionRequest?: Transaction;
  authenticatedUser?: User;
};

describe("Transaction View", function () {
  const ctx: NewTransactionCtx = {};

  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("GET", "/transactions*").as("personalTransactions");
    cy.intercept("GET", "/transactions/public*").as("publicTransactions");
    cy.intercept("GET", "/transactions/*").as("getTransaction");
    cy.intercept("PATCH", "/transactions/*").as("updateTransaction");

    cy.intercept("GET", "/checkAuth").as("userProfile");
    cy.intercept("GET", "/notifications").as("getNotifications");
    cy.intercept("GET", "/bankAccounts").as("getBankAccounts");

    cy.database("find", "users").then((user: User) => {
      ctx.authenticatedUser = user;

      cy.loginByXstate(ctx.authenticatedUser.username);

      cy.database("find", "transactions", {
        receiverId: ctx.authenticatedUser.id,
        status: "pending",
        requestStatus: "pending",
        requestResolvedAt: "",
      }).then((transaction: Transaction) => {
        ctx.transactionRequest = transaction;
      });
    });

    cy.getBySel("nav-personal-tab").click();
    cy.wait("@personalTransactions");
  });

  it("transactions navigation tabs are hidden on a transaction view page", function () {
    cy.getBySelLike("transaction-item").first().click();
    cy.location("pathname").should("include", "/transaction");
    cy.getBySel("nav-transaction-tabs").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Navigation Tabs Hidden");
  });

  it("likes a transaction", function () {
    cy.getBySelLike("transaction-item").first().click();
    cy.wait("@getTransaction");

    cy.getBySelLike("like-button").click();
    cy.getBySelLike("like-count").should("contain", 1);
    cy.getBySelLike("like-button").should("be.disabled");
    cy.visualSnapshot("Transaction after Liked");
  });

  it("comments on a transaction", function () {
    cy.getBySelLike("transaction-item").first().click();
    cy.wait("@getTransaction");

    const comments = ["Thank you!", "Appreciate it."];

    comments.forEach((comment, index) => {
      cy.getBySelLike("comment-input").type(`${comment}{enter}`);
      cy.getBySelLike("comments-list").children().eq(index).contains(comment);
    });

    cy.getBySelLike("comments-list").children().should("have.length", comments.length);
    cy.visualSnapshot("Comment on Transaction");
  });

  it("accepts a transaction request", function () {
    cy.visit(`/transaction/${ctx.transactionRequest!.id}`);
    cy.wait("@getTransaction");

    cy.getBySelLike("accept-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("equal", 204);
    cy.getBySelLike("accept-request").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Accepted");
  });

  it("rejects a transaction request", function () {
    cy.visit(`/transaction/${ctx.transactionRequest!.id}`);
    cy.wait("@getTransaction");

    cy.getBySelLike("reject-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("equal", 204);
    cy.getBySelLike("reject-request").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Rejected");
  });

  it("does not display accept/reject buttons on completed request", function () {
    cy.database("find", "transactions", {
      receiverId: ctx.authenticatedUser!.id,
      status: "complete",
      requestStatus: "accepted",
    }).then((transactionRequest) => {
      cy.visit(`/transaction/${transactionRequest!.id}`);

      cy.wait("@getNotifications");
      cy.getBySel("nav-top-notifications-count").should("be.visible");
      cy.getBySel("transaction-detail-header").should("be.visible");
      cy.getBySel("transaction-accept-request").should("not.exist");
      cy.getBySel("transaction-reject-request").should("not.exist");
      cy.getBySel("transaction-detail-header").should("be.visible");
      cy.visualSnapshot("Transaction Completed (not able to accept or reject)");
    });
  });
});

import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

const apiGraphQL = `${Cypress.env("apiUrl")}/graphql`;

type BankAccountsTestCtx = {
  user?: User;
};

describe("Bank Accounts", function () {
  const ctx: BankAccountsTestCtx = {};

  beforeEach(function () {
    cy.task("db:seed");

    cy.intercept("GET", "/notifications").as("getNotifications");

    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;

      if (body.hasOwnProperty("operationName") && body.operationName === "ListBankAccount") {
        req.alias = "gqlListBankAccountQuery";
      }

      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {
        req.alias = "gqlCreateBankAccountMutation";
      }

      if (body.hasOwnProperty("operationName") && body.operationName === "DeleteBankAccount") {
        req.alias = "gqlDeleteBankAccountMutation";
      }
    });

    cy.database("find", "users").then((user: User) => {
      ctx.user = user;

      return cy.loginByXstate(ctx.user.username);
    });
  });

  it("creates a new bank account", function () {
    cy.wait("@getNotifications");
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-bankaccounts").click();

    cy.getBySel("bankaccount-new").click();
    cy.location("pathname").should("eq", "/bankaccounts/new");
    cy.visualSnapshot("Display New Bank Account Form");

    cy.getBySelLike("bankName-input").type("The Best Bank");
    cy.getBySelLike("routingNumber-input").type("987654321");
    cy.getBySelLike("accountNumber-input").type("123456789");
    cy.visualSnapshot("Fill out New Bank Account Form");
    cy.getBySelLike("submit").click();

    cy.wait("@gqlCreateBankAccountMutation");

    cy.getBySelLike("bankaccount-list-item")
      .should("have.length", 2)
      .eq(1)
      .should("contain", "The Best Bank");
    cy.visualSnapshot("Bank Account Created");
  });

  it("should display bank account form errors", function () {
    cy.visit("/bankaccounts");
    cy.getBySel("bankaccount-new").click();

    cy.getBySelLike("bankName-input").type("The").find("input").clear().blur();
    cy.get("#bankaccount-bankName-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter a bank name");

    cy.getBySelLike("bankName-input").type("The").find("input").blur();
    cy.get("#bankaccount-bankName-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain at least 5 characters");

    /** Routing number input validations **/
    // Required field
    cy.getBySelLike("routingNumber-input").find("input").focus().blur();
    cy.get(`#bankaccount-routingNumber-input-helper-text`)
      .should("be.visible")
      .and("contain", "Enter a valid bank routing number");

    // Min 9 digit
    cy.getBySelLike("routingNumber-input").type("12345678").find("input").blur();
    cy.get("#bankaccount-routingNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain a valid routing number");
    cy.getBySelLike("routingNumber-input").find("input").clear();

    cy.getBySelLike("routingNumber-input").type("123456789").find("input").blur();
    cy.get("#bankaccount-routingNumber-input-helper-text").should("not.exist");

    /** Account number input validations **/
    // Required field
    cy.getBySelLike("accountNumber-input").find("input").focus().blur();
    cy.get(`#bankaccount-accountNumber-input-helper-text`)
      .should("be.visible")
      .and("contain", "Enter a valid bank account number");

    // Min 9 digit
    cy.getBySelLike("accountNumber-input").type("12345678").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain at least 9 digits");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    cy.getBySelLike("accountNumber-input").type("123456789").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text").should("not.exist");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    // Max 12 gdigit
    cy.getBySelLike("accountNumber-input").type("123456789111").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text").should("not.exist");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    cy.getBySelLike("accountNumber-input").type("1234567891111").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain no more than 12 digits");

    cy.getBySel("bankaccount-submit").should("be.disabled");
    cy.visualSnapshot("Bank Account Form with Errors and Submit button disabled");
  });

  it("soft deletes a bank account", function () {
    cy.visit("/bankaccounts");
    cy.getBySelLike("delete").first().click();

    cy.wait("@gqlDeleteBankAccountMutation");
    cy.getBySelLike("list-item").children().contains("Deleted");
    cy.visualSnapshot("Soft Delete Bank Account");
  });

  // TODO: [enhancement] the onboarding modal assertion can be removed after adding "onboarded" flag to user profile
  it("renders an empty bank account list state with onboarding modal", function () {
    cy.wait("@getNotifications");
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;
      if (body.hasOwnProperty("operationName") && body.operationName === "ListBankAccount") {
        req.alias = "gqlListBankAccountQuery";
        req.continue((res) => {
          res.body.data.listBankAccount = [];
        });
      }
    });

    cy.visit("/bankaccounts");
    cy.wait("@getNotifications");
    cy.wait("@gqlListBankAccountQuery");

    cy.getBySel("bankaccount-list").should("not.exist");
    cy.getBySel("empty-list-header").should("contain", "No Bank Accounts");
    cy.getBySel("user-onboarding-dialog").should("be.visible");
    cy.getBySel("nav-top-notifications-count").should("exist");
    cy.visualSnapshot("User Onboarding Dialog is Visible");
  });
});
