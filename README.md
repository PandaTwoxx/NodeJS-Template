# NodeJS-Template
#### To develop with this system, you need to know typescript
A Node.Js template
## Installation
To install dependencies, run the following command:
```bash
npm install
```

# Developing
### Important Note!!
By default, the `npm start` runs the index.js file. To change this, change the line in package.json to `"start":"new-command"`

## Writing a program
* Create a ts file in the src folder
#### Import statement
* First import the needed classes and functions from nodeHttpRouter.ts with:
```typescript
import { Router, Plugin, RouteHandler, renderTemplate } from "./nodeHttpRouter";
```
#### Router declaration
* Next initilize a router instance
```typescript
const router = new Router();
```
* This router is going to be the main class controlling your web app!
#### App routes
* Create a app route with the following syntax:
```typescript
router.addRoute(
  "GET",
  "/greet",
  (req, res) => {
    res.end("Hello, welcome to our server!");
  }, aPlugin, "/new_page"
);
```
* There are 5 parameters, Method, Path, RouteHandler function, Plugins, and Redirect
#### Plugins
* Plugins are helpful functions that can apply on a global scale or only on certain routes. Plugins are things that run before the user gets their response. They can have three statuses denoted by what it returns, true(proceed), false(halt), RouteHandler(Overrides default route handler set in the router.addRoute function)
* Here is an example plugin
```typescript
const customGreetingPlugin: Plugin = {
  name: "customGreeting",
  handler: async (req, res, params, query) => {
    // Check if a "name" query parameter exists
    if (query && typeof query.name === "string") {
      // Return a custom handler that overrides the default one
      const customHandler: RouteHandler = async (req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(`Hello, ${query.name}! This is a custom greeting.`);
      };
      return customHandler;
    }

    // Allow the default handler to proceed if "name" is not provided
    return true;
  },
};
```
* Plugins can be applied in to ways
```typescript
// On a global specific
router.addGlobalPlugin(
    customGreetingPlugin
);
```
```typescript
// Route specific
router.addRoute(
    /*Put other parameters here*/
    customGreetingPlugin
);
```
#### Testing
* You can also create tests to check if your route endpoints are working. Tests check whether or not routes are accessible. In a test case, you can pass a name, method, path, expectedParams?, and expectedMatch
* Here's an example
```typescript
// Test cases
const testCases = [
  {
    name: "Match /greet",
    method: "GET",
    path: "/greet",
    expectedMatch: true,
  },
  {
    name: "Match /user/123 with params",
    method: "GET",
    path: "/user/123",
    expectedMatch: true,
    expectedParams: { id: "123" },
  },
  {
    name: "No match for invalid route",
    method: "GET",
    path: "/invalid",
    expectedMatch: false,
  },
];
```
* Then you can pass the tests into the runTests function to get the results
```typescript
const results = router.runTests(testCases);
```
* However so far you cant view the results. Use this function to print them to the terminal
```typescript
router.printTestResults(results);
```
#### Redirection
* To make redirects, use this function in your RouteHandler function
```typescript
res.redirect('/path/to/redirect')
```
#### Rendering Templates
* Currently your addRoute function probably looks like this
```typescript
router.addRoute(
  "GET",
  "/greet",
  (req, res) => {
    res.end(`
    <html>
    <body>
        <h1>Hello, ${name}!</h1>
    </body>
    </html>

    `);
  },
);
```
* What would be better is if you could pull this from a file
* You can use the renderTemplate function for that
```typescript
router.addRoute(
  "GET",
  "/template",
  async (req, res) => {
    await res.renderTemplate("example.html", { name: "Weston" });
  }
);
```
* There are two parameters, the path to the file in the templates/ folder and the dictionary of the things from the template to replace with real values
## Conclusion
#### 🎉 Congrats, you just learned how to use this system
### Here's an example program
```typescript
import { Router, Plugin, RouteHandler } from "./your-router-file";

const router = new Router();

// Global Plugin: Logs each request
const loggerPlugin: Plugin = {
  name: "Logger",
  handler: async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`);
    return true; // Allow default handler to proceed
  },
};

// Route Plugin: Checks authentication
const authPlugin: Plugin = {
  name: "Auth",
  handler: async (req, res) => {
    const isAuthenticated = req.headers["x-auth-token"] === "valid-token";
    if (!isAuthenticated) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized");
      return false; // Halt the request
    }
    return true; // Allow default handler to proceed
  },
};

// Add global plugin
router.addGlobalPlugin(loggerPlugin);

// Route: Static greeting
router.addRoute(
  "GET",
  "/greet",
  (req, res) => {
    res.end("Hello, welcome to our server!");
  },
  [authPlugin] // Auth plugin applied to this route
);

// Route: Render a dynamic template
router.addRoute(
  "GET",
  "/template",
  async (req, res) => {
    await res.renderTemplate("example.html", { name: "Weston" });
  }
);

// Route: JSON body parsing and response
router.addRoute("POST", "/submit", async (req, res, params, query, body) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ received: body }));
});

// Route: Redirect example
router.addRoute("GET", "/redirect", (req, res) => {
  res.redirect("/greet");
});

// Route with parameters
router.addRoute(
  "GET",
  "/user/:id",
  (req, res, params) => {
    res.end(`User ID: ${params?.id}`);
  }
);

// Test cases
const testCases = [
  {
    name: "Match /greet",
    method: "GET",
    path: "/greet",
    expectedMatch: true,
  },
  {
    name: "Match /user/123 with params",
    method: "GET",
    path: "/user/123",
    expectedMatch: true,
    expectedParams: { id: "123" },
  },
  {
    name: "No match for invalid route",
    method: "GET",
    path: "/invalid",
    expectedMatch: false,
  },
];

// Run tests
const results = router.runTests(testCases);
router.printTestResults(results);

// Start the server
const server = router.createServer();
server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```
### But how do run this?
* Run this command to compile this code
```bash
npx tsc
```
* IMPORTANT: In your newly compiled main.js file in the dist directory, at the top import statement it will look like this
```typescript
import { ... } from "./nodeHttpRouter"
```
* You NEED to add the .js extention to the file path
```typescript
import { ... } from "./nodeHttpRouter.js"
```
* Now you can run the file with `npm start`
* Your program is now active at localhost:port eg http://localhost:3000