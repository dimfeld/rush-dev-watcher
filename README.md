# rush-dev-watcher
Run development build commands across a project and its dependencies. This is designed to run inside a [Rush monorepo](https://rushjs.io/). 

This tool builds a DAG from the dependencies and attempts to schedule the `dev` commands so that a package doesn't start building until after all its dependencies listed in the command have built once. After that, all the dev watchers started by the command remain active.

## Usage:

```shell
# Run dev commands for multiple packages at once.
> dev package1 package2

# Run dev commands for a package and its dependencies
> dev --and-deps api

# Run dev commands for a package's dependencies, but not the package itself.
> dev --just-deps website
```

## Caveats

1. It's hardcoded to run the `dev` script in the package.json of each package.
2. Although the script detects when watcher commands have finished their first build, it just looks for specific strings. You may need to customize this for your  toolchain.
3. I've only tested this on my monorepo at work. It works great there but may not work elsewhere.
