# Enhanced Router Documentation

This document provides detailed information about the `Router` class and its associated utilities, designed for building robust and flexible web applications in Node.js.

## Overview

The `Router` class provides a mechanism for defining and handling HTTP routes. It supports:

*   **Multiple HTTP methods per route:**  Allows a single path to respond to different HTTP methods (GET, POST, PUT, DELETE, etc.).
*   **Route parameters:**  Enables capturing dynamic segments in URLs.
*   **Query string parsing:**  Automatically parses query parameters.
*   **Request body parsing:**  Supports parsing `application/x-www-form-urlencoded` and `application/json` request bodies.
*   **Customizable responses:**  Provides utilities for redirection and template rendering.
*   **Middleware support (Plugins):**  Allows attaching pre- and post-processing logic to routes.
*   **Comprehensive testing:**  Includes a built-in testing framework for route matching.

## Core Components

### Types and Interfaces

*   **`RouteHandler`**:
    ```typescript
    type RouteHandler = (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      params?: Record<string, string>,
      query?: Record<string, string | string[]>,
      body?: Record<string, string>,
    ) => void;
    ```
    Defines the structure of a function that handles incoming requests. It provides access to the request object (`req`), the response object (`res`), route parameters (`params`), query parameters (`query`), and the parsed request body (`body`).

*   **`Route`**:
    ```typescript
    interface Route {
      methods: string[];
      path: string;
      handler: RouteHandler;
    }
    ```
    Represents a defined route with an array of allowed HTTP methods (`methods`), the URL path (`path`), and the handler function (`handler`).

*   **`EnhancedServerResponse`**:
    ```typescript
    interface EnhancedServerResponse extends http.ServerResponse {
      redirect: (url: string, statusCode?: number) => void;
      renderTemplate: (templatePath: string, context?: Record<string, any>) => Promise<void>;
    }
    ```
    Extends the standard `http.ServerResponse` with utility methods for redirection (`redirect`) and rendering templates (`renderTemplate`).

*   **`TestCase`**:
    ```typescript
    interface TestCase {
      name: string;
      method: string;
      path: string;
      expectedParams?: Record<string, string>;
      expectedMatch: boolean;
    }
    ```
    Defines the structure for a test case used by the `runTests` method. It includes a name, HTTP method, path, expected route parameters, and whether a match is expected.

*   **`TestResult`**:
    ```typescript
    interface TestResult {
      name: string;
      passed: boolean;
      message?: string;
    }
    ```
    Represents the result of a single test case, indicating whether it passed and providing an optional error message.

*   **`Plugin`**:
    ```typescript
    interface Plugin {
      name: string;
      handler: (
        req: http.IncomingMessage,
        res: EnhancedServerResponse,
        params?: Record<string, string>,
        query?: Record<string, string | string[]>,
        body?: Record<string, string>
      ) => Promise<RouteHandler | true | false>;
    }
    ```
    Defines the structure for a plugin (middleware). The `handler` function can modify the request handling flow by returning:
    *   `true`: Proceed with the next plugin or the route handler.
    *   `false`: Halt the request processing.
    *   A `RouteHandler`: Override the current route handler.

### Utility Functions

*   **`renderTemplate(templatePath: string, context?: Record<string, any>): Promise<string>`**:
    Asynchronously reads a template file and renders it using the provided context. Assumes templates are located in a `templates` directory at the project root.

*   **`parseBody(req: http.IncomingMessage): Promise<Record<string, string>>`**:
    Asynchronously parses the request body based on the `Content-Type` header. Supports `application/x-www-form-urlencoded` and `application/json`.

*   **`enhanceResponse(res: http.ServerResponse): EnhancedServerResponse`**:
    Extends the standard `http.ServerResponse` object with the `redirect` and `renderTemplate` methods.

## `Router` Class

The core of the routing functionality.

### Constructor

The `Router` class has a default constructor and does not require any arguments for instantiation.

### Methods

*   **`addGlobalPlugin(plugin: Plugin): void`**:
    Registers a global plugin that will be executed for every incoming request before the route-specific handlers.

    ```typescript
    const authPlugin: Plugin = {
      name: "auth",
      handler: async (req, res) => {
        // Authentication logic
        if (!isAuthenticated(req)) {
          res.statusCode = 401;
          res.end("Unauthorized");
          return false; // Halt request processing
        }
        return true; // Proceed
      },
    };
    router.addGlobalPlugin(authPlugin);
    ```

*   **`addRoute(methods: string | string[], path: string, handler: RouteHandler, customPlugins: Plugin[] = [], redirectTo?: string): void`**:
    Registers a new route with the specified HTTP methods, path, and handler function.

    *   `methods`: A string or an array of strings representing the allowed HTTP methods (e.g., 'GET', ['POST', 'PUT']).
    *   `path`: The URL path for the route (e.g., '/users', '/items/:id'). Route parameters are denoted with a colon (e.g., `:id`).
    *   `handler`: The `RouteHandler` function to execute when the route matches.
    *   `customPlugins`: An optional array of `Plugin` instances to be executed specifically for this route.
    *   `redirectTo`: An optional URL to redirect to after the handler is executed.

    ```typescript
    router.addRoute('GET', '/', (req, res) => {
      res.end('Welcome!');
    });

    router.addRoute(['POST', 'PUT'], '/users', async (req, res, params, query, body) => {
      console.log('Creating or updating user:', body);
      res.statusCode = 201;
      res.end('User created/updated');
    });

    router.addRoute('GET', '/items/:id', (req, res, params) => {
      res.end(`Viewing item with ID: ${params?.id}`);
    });
    ```

*   **`matchRoute(method: string, url: string): { handler: RouteHandler; params: Record<string, string>; } | null`**:
    Attempts to find a matching route for the given HTTP method and URL path.

    *   `method`: The HTTP method of the request.
    *   `url`: The URL path of the request.

    Returns an object containing the `handler` and extracted route `params` if a match is found, otherwise returns `null`.

    ```typescript
    const match = router.matchRoute('GET', '/items/123');
    if (match) {
      console.log('Matched handler:', match.handler);
      console.log('Route parameters:', match.params); // Output: { id: '123' }
    }
    ```

*   **`handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void`**:
    The main request handling logic. It matches the incoming request to a defined route, parses the request body, and executes the corresponding handler.

    *   `req`: The incoming HTTP request object.
    *   `res`: The HTTP response object.

    This method is typically used within an HTTP server's request listener.

    ```typescript
    const server = http.createServer((req, res) => {
      router.handleRequest(req, res);
    });
    ```

*   **`runTests(testCases: TestCase[]): TestResult[]`**:
    Executes a series of test cases to verify route matching.

    *   `testCases`: An array of `TestCase` objects defining the test scenarios.

    Returns an array of `TestResult` objects, indicating the outcome of each test case.

    ```typescript
    const testCases: TestCase[] = [
      { name: 'Match exact path', method: 'GET', path: '/', expectedMatch: true },
      { name: 'Match path with params', method: 'GET', path: '/users/1', expectedMatch: true, expectedParams: { id: '1' } },
      { name: 'No match', method: 'GET', path: '/nonexistent', expectedMatch: false },
      { name: 'Method mismatch', method: 'POST', path: '/', expectedMatch: false },
    ];
    const results = router.runTests(testCases);
    router.printTestResults(results);
    ```

*   **`printTestResults(results: TestResult[]): { totalTests: number; passed: number; failed: number; }`**:
    Prints the results of the test suite to the console with formatting.

    *   `results`: An array of `TestResult` objects.

    Returns an object containing the total number of tests, the number of passed tests, and the number of failed tests.

*   **`createServer(): http.Server`**:
    Creates and returns a configured `http.Server` instance that uses the router's `handleRequest` method to process incoming requests.

    ```typescript
    const server = router.createServer();
    server.listen(3000, () => {
      console.log('Server listening on port 3000');
    });
    ```

## Usage Examples

### Basic Route Handling

```typescript
import * as http from 'node:http';
import { Router } from './your-router-file'; // Adjust path

const router = new Router();

router.addRoute('GET', '/', (req, res) => {
  res.end('Welcome to the homepage!');
});

router.addRoute('GET', '/about', (req, res) => {
  res.end('This is the about page.');
});

const server = router.createServer();
server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
```
Route Parameters
```typescript
router.addRoute('GET', '/users/:id', (req, res, params) => {
  const userId = params?.id;
  res.end(`Viewing user with ID: ${userId}`);
});
```
Handling Different HTTP Methods
```
router.addRoute(['GET', 'POST'], '/items', (req, res) => {
  if (req.method === 'GET') {
    res.end('List of items');
  } else if (req.method === 'POST') {
    // Handle item creation
    res.statusCode = 201;
    res.end('Item created');
  }
});
```
Using Plugins (Middleware)
```TypeScript
const loggerPlugin: Plugin = {
  name: 'logger',
  handler: async (req, res) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    return true; // Proceed
  },
};

router.addGlobalPlugin(loggerPlugin);

router.addRoute('GET', '/data', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ message: 'Data endpoint' }));
});
```
Running Tests
```TypeScript
const testCases: TestCase[] = [
  { name: 'Home page GET', method: 'GET', path: '/', expectedMatch: true },
  { name: 'About page GET', method: 'GET', path: '/about', expectedMatch: true },
  { name: 'User profile with ID 123', method: 'GET', path: '/users/123', expectedMatch: true, expectedParams: { id: '123' } },
  { name: 'Non-existent route', method: 'GET', path: '/not-found', expectedMatch: false },
];

const results = router.runTests(testCases);
router.printTestResults(results);
```
