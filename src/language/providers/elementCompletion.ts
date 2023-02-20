/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode'
import {
  checkBraceOpen,
  getXsdNsPrefix,
  nearestOpen,
  //isBetweenOpenCloseTags,
  createCompletionItem,
  getCommonItems,
  nearestTag,
  getCloseTag,
  getItemsOnLineCount,
} from './utils'
import { elementCompletion } from './intellisense/elementItems'
//import { elementCompletion } from './intellisense/elementItems'

export function getElementCompletionProvider(dfdlFormatString: string) {
  return vscode.languages.registerCompletionItemProvider('dfdl', {
    provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
    ) {
      if (checkBraceOpen(document, position)) {
        console.log('in elementCompletionProvider - brace is showing open')
        return undefined
      }
      let nsPrefix = getXsdNsPrefix(document, position)
      let triggerLine = position.line
      let triggerPos = position.character
      let triggerText = document.lineAt(triggerLine).text
      let itemsOnLine = getItemsOnLineCount(triggerText)
      let nearestOpenItem = nearestOpen(document, position)

      //const triggerChar = document.lineAt(position.line).text.charAt(position.character)

      if (nearestOpenItem.includes('none')) {
        let definedVariables = getDefinedVariables(document)

        let isBeforeTrigger = true
        let startLine = triggerLine
        let startPos = triggerPos
        //let lineNum = startLine
        let tagNearestTrigger = 'none'
        while (isBeforeTrigger) {
          let [foundTag, foundLine, foundPos] = nearestTag(
            document,
            position,
            nsPrefix,
            startLine,
            startPos
          )
          startLine = foundLine
          let [endTag, endTagLine, endTagPos] = getCloseTag(
            document,
            position,
            nsPrefix,
            foundTag,
            foundLine,
            foundPos
          )
          if (itemsOnLine > 1) {
            if (foundTag === endTag && endTagPos >= triggerPos) {
              tagNearestTrigger = foundTag
              //              if (isBetweenOpenCloseTags(document, position, tagNearestTrigger, lineNum)) {
              break
              //              }
            }
            if (endTag === 'none') {
              startLine = foundLine - 1
            } else {
              startPos = foundPos - 1
            }
          }
          if (itemsOnLine < 2) {
            if (foundTag === endTag && endTagLine >= triggerLine) {
              //lineNum = foundLine
              tagNearestTrigger = foundTag
              //              if (isBetweenOpenCloseTags(document, position, tagNearestTrigger, lineNum)) {
              break
              //              }
            }
            startLine = foundLine - 1
          }
        }

        if (tagNearestTrigger === 'element') {
          return getElementCompletionItems(
            [
              'complexType',
              'simpleType',
              'annotation',
              'appinfo',
              'dfdl:discriminator',
              'dfdl:assert',
            ],
            '',
            definedVariables,
            nsPrefix
          )
        }

        if (tagNearestTrigger === 'sequence') {
          return getElementCompletionItems(
            [
              'element',
              'sequence',
              'choice',
              'annotation',
              'appinfo',
              'dfdl:discriminator',
              'dfdl:assert',
            ],
            '',
            '',
            nsPrefix
          )
        }

        if (tagNearestTrigger === 'choice') {
          return getElementCompletionItems(
            ['element', 'group ref'],
            '',
            '',
            nsPrefix
          )
        }

        if (tagNearestTrigger === 'group') {
          return getElementCompletionItems(['sequence'], '', '', nsPrefix)
        }

        if (tagNearestTrigger === 'complexType') {
          return getElementCompletionItems(['sequence'], '', '', nsPrefix)
        }

        if (tagNearestTrigger === 'simpleType') {
          return getElementCompletionItems(['restriction'], '', '', nsPrefix)
        }

        if (tagNearestTrigger === 'schema') {
          return getElementCompletionItems(
            [
              'element',
              'group',
              'complexType',
              'simpleType',
              'annotation',
              'appinfo',
              'dfdl:defineVariable',
              'dfdl:setVariable',
            ],
            '',
            '',
            nsPrefix
          )
        }
      }

      /*      // a completion item that inserts its text as snippet,
      // the `insertText`-property is a `SnippetString` which will be
      // honored by the editor.
      
      let compItems: vscode.CompletionItem[] = []

      elementCompletion(
        definedVariables,
        dfdlFormatString,
        nsPrefix
      ).items.forEach((e) => {
        const completionItem = new vscode.CompletionItem(e.item)
        completionItem.insertText = new vscode.SnippetString(e.snippetString)

        if (e.markdownString) {
          completionItem.documentation = new vscode.MarkdownString(
            e.markdownString
          )
        }
        compItems.push(completionItem)
      })
      return compItems
      */
    },
  })
}

function getElementCompletionItems(
  itemsToUse: string[],
  preVal: string = '',
  definedVariables: string = '',
  nsPrefix: string
) {
  let compItems: vscode.CompletionItem[] = getCommonItems(
    itemsToUse,
    preVal,
    definedVariables,
    nsPrefix
  )
  let dfdlFormatString: string = ''

  elementCompletion(definedVariables, dfdlFormatString, nsPrefix).items.forEach(
    (e) => {
      for (let i = 0; i < itemsToUse.length; ++i) {
        if (e.item.includes(itemsToUse[i])) {
          const completionItem = createCompletionItem(e, preVal, nsPrefix)
          compItems.push(completionItem)
        }
      }
    }
  )

  return compItems
}

function getDefinedVariables(document: vscode.TextDocument) {
  let additionalTypes = ''
  let lineNum = 0
  let itemCnt = 0
  const lineCount = document.lineCount
  while (lineNum !== lineCount) {
    const triggerText = document
      .lineAt(lineNum)
      .text.substring(0, document.lineAt(lineNum).range.end.character)
    if (triggerText.includes('dfdl:defineVariable name=')) {
      let startPos = triggerText.indexOf('"', 0)
      let endPos = triggerText.indexOf('"', startPos + 1)
      let newType = triggerText.substring(startPos + 1, endPos)
      if (itemCnt === 0) {
        additionalTypes = newType
        ++itemCnt
      } else {
        additionalTypes = String(additionalTypes + ',' + newType)
        ++itemCnt
      }
    }
    ++lineNum
  }
  return additionalTypes
}
/*function getCompletionItems(arg0: string[], nsPrefix: string): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
  throw new Error('Function not implemented.')
}*/
