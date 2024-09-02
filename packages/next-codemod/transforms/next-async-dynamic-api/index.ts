import type { API, FileInfo } from 'jscodeshift'

export default function transform(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)
  let modified = false

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processCalls(functionName: 'cookies' | 'headers') {
    // Process each call to cookies() or headers()
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: functionName,
        },
      })
      .forEach((path) => {
        const isClientEnvironment =
          root.find(j.Literal, { value: 'use client' }).size() > 0

        const closestFunction = j(path).closest(j.FunctionDeclaration)
        const isAsyncFunction = closestFunction
          .nodes()
          .some((node) => node.async)

        if (isClientEnvironment || !isAsyncFunction) {
          // Wrap cookies() with use() from 'react'
          j(path).replaceWith(
            j.callExpression(j.identifier('use'), [
              j.callExpression(j.identifier(functionName), []),
            ])
          )
          needsReactUseImport = true
          modified = true
        } else if (isAsyncFunction) {
          // Add 'await' in front of cookies() call
          j(path).replaceWith(
            j.awaitExpression(j.callExpression(j.identifier(functionName), []))
          )
          modified = true
        }
      })
  }

  processCalls('cookies')
  processCalls('headers')

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    const hasReactUseImport =
      root
        .find(j.ImportSpecifier, {
          imported: {
            type: 'Identifier',
            name: 'use',
          },
        })
        .size() > 0

    if (!hasReactUseImport) {
      const reactImportDeclaration = root.find(j.ImportDeclaration, {
        source: {
          type: 'Literal',
          value: 'react',
        },
      })

      if (reactImportDeclaration.size() > 0) {
        // Add 'use' to existing 'react' import declaration
        reactImportDeclaration
          .get()
          .node.specifiers.push(j.importSpecifier(j.identifier('use')))
      } else {
        // Create new import declaration for 'use' from 'react'
        const newImport = j.importDeclaration(
          [j.importSpecifier(j.identifier('use'))],
          j.literal('react')
        )

        // append after "use client" directive if there's any
        const clientDirectives = root.find(j.Literal, { value: 'use client' })
        if (clientDirectives.size() > 0) {
          const parent = clientDirectives.get().parentPath
          if (parent) {
            parent.insertAfter(newImport)
          } else {
            if (root.length > 0) {
              root.at(0).insertAfter(newImport)
            } else {
              root.get().node.program.body.unshift(newImport)
            }
          }
        } else {
          root.get().node.program.body.unshift(newImport)
        }
      }
      modified = true
    }
  }

  return modified ? root.toSource() : undefined
}
