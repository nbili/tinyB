import css from 'css'
import layout from './layout'

export type cType = Symbol | string
export type tokenType = {
  type?: string,
  tagName?: string,
  content?: string,
  isSelfClosing?: string
}
export type topType = {
  tagName?: string,
  children?: topType[]
  content?: string
}

const EOF = Symbol('EOF')

let currentToken = null
let currentAttribute = null
let currentTextNode = null

let stack = [{ type: 'document', children: [] }]
const rules = []

function addCSSRules(text) {
  let ast = css.parse(text)
  rules.push(...ast.stylesheet.rules)
}

function match(element, selector) {
  if (!element.attributes || !selector) {
    return false
  }

  if (selector.charAt(0) === '#') {
    let attr = element.attributes.filter(attr => attr.name === 'id')[0]
    if (attr && attr.value === selector.replace('#', ''))
      return true
  } else if (selector.charAt(0) === '.') {
    let attr = element.attributes.filter(attr => attr.name === 'class')[0]
    if (attr && attr.value === selector.replace('.', ''))
      return true
  } else {
    if (element.tagName === selector) {
      return true
    }
  }

  return false
}

function specificity(selector) {
  // style id class tag
  const p = [0, 0, 0, 0]
  const selectorParts = selector.split(' ')
  for (let part of selectorParts) {
    if (part.charAt(0) == '#') {
      p[1] += 1
    } else if (part.charAt(0) == '.') {
      p[2] += 1
    } else {
      p[3] += 1
    }
  }
  return p
}

function compare(sp1, sp2) {
  if (sp1[0] - sp2[0]) {
    return sp1[0] - sp2[0]
  }
  if (sp1[1] - sp2[1]) {
    return sp1[1] - sp2[1]
  }
  if (sp1[2] - sp2[2]) {
    return sp1[2] - sp2[2]
  }

  return sp1[3] - sp2[3]
}

function computeCSS(element) {
  let elements = stack.slice().reverse()

  if (!element.computedStyle) {
    element.computedStyle = {}
  }
  for (let rule of rules) {
    let matched = false

    let selectorParts = rule.selectors[0].split(' ').reverse()
    if (!match(element, selectorParts[0])) {
      continue
    }

    let s = 1
    for (let i = 0; i < elements.length; i++) {
      if (match(elements[i], selectorParts[s])) {
        s++
      }
    }

    if (s >= selectorParts.length) {
      matched = true
    }

    if (matched) {
      const sp = specificity(rule.selectors[0])
      const computedStyle = element.computedStyle
      for (var declaration of rule.declarations) {
        if (!computedStyle[declaration.property]) {
          computedStyle[declaration.property] = {}
        }
        if (!computedStyle[declaration.property].specificity) {
          computedStyle[declaration.property].value = declaration.value
          computedStyle[declaration.property].specificity = sp
        } else if (compare(computedStyle[declaration.property].specificity, sp) < 0) {
          computedStyle[declaration.property].value = declaration.value
          computedStyle[declaration.property].specificity = sp
        }
      }
    }
  }

}

function emit(token: tokenType) {
  let top = stack[stack.length - 1] as topType

  if (token.type === 'startTag') {
    let element = {
      type: 'element',
      children: [],
      attributes: []
    };

    (element as any).tagName = token.tagName
    for (let p in token) {
      if (p != 'type' && p != 'tagName') {
        element.attributes.push({
          name: p,
          value: token[p]
        })
      }
    }

    // get element must to compute CSS
    computeCSS(element)

    top.children.push(element);

    if (!token.isSelfClosing)
      stack.push(element)

    currentTextNode = null

  } else if (token.type === 'endTag') {
    if (top.tagName !== token.tagName) {
      throw new Error('tag not match')
    } else {
      if (top.tagName === 'style') {
        addCSSRules(top.children[0].content)
      }
      layout(top)
      stack.pop()
    }
    currentTextNode = null
  } else if (token.type === 'text') {
    if (currentTextNode == null) {
      currentTextNode = {
        type: 'text',
        content: ''
      }
      top.children.push(currentTextNode)
    }
    currentTextNode.content += token.content
  }
}

function data(c: cType) {
  if (c === '<') {
    return tagOpen
  } else if (c === EOF) {
    emit({
      type: 'EOF'
    })
    return
  } else {
    emit({
      type: 'text',
      content: c as string
    })
    return data
  }
}

function tagOpen(c: string) {
  if (c === '/') {
    return endTagOpen
  } else if (c.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: 'startTag',
      tagName: ''
    }
    return tagName(c)
  } else {
    return data
  }
}

function endTagOpen(c: string) {
  if (c.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: 'endTag',
      tagName: ''
    }
    return tagName(c)
  } else if (c === '>') {

  } else {

  }
}

function tagName(c: string) {
  if (c.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName
  } else if (c === '/') {
    return selfClosingStartTag
  } else if (c.match(/^[a-zA-Z]$/)) {
    currentToken.tagName += c.toLowerCase()
    return tagName
  } else if (c === '>') {
    emit(currentToken)
    return data
  } else {
    currentToken.tagName += c
    return tagName
  }
}

function beforeAttributeName(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/)) {
    return beforeAttributeName
  } else if (c === '>' || c === '/' || c === EOF) {
    return afterAttributeName(c)
  } else if (c === '=') {
    // This is an unexpected-equals-sign-before-attribute-name parse error.
    // Start a new attribute in the current tag token.
    // Set that attribute's name to the current input character, and its value to the empty string.
    // Switch to the attribute name state.
  } else {
    currentAttribute = {
      name: '',
      value: ''
    }
    return attributeName(c)
  }
}

function attributeName(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) {
    return afterAttributeName(c)
  } else if (c === '=') {
    return beforeAttributeValue
  } else if (c === '\'' || c === '"' || c === '<') {

  } else {
    currentAttribute.name += c
    return attributeName
  }
}

function doubleQuotedAttributeValue(c: cType) {
  if (c === '"') {
    currentToken[currentAttribute.name] = currentAttribute.value
    return afterQuotedAttributeValue
  } else if (c === '\u0000') {

  } else if (c === EOF) {

  } else {
    currentAttribute.value += c
    return doubleQuotedAttributeValue
  }
}

function singleQuotedAttributeValue(c: cType) {
  if (c === "'") {
    currentToken[currentAttribute.name] = currentAttribute.value
    return afterQuotedAttributeValue
  } else if (c === '\u0000') {

  } else if (c === EOF) {

  } else {
    currentAttribute.value += c
    return doubleQuotedAttributeValue
  }

}

function unquotedAttributeValue(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/)) {
    currentToken[currentAttribute.name] = currentAttribute.value
    return beforeAttributeName
  } else if (c === '/') {
    currentToken[currentAttribute.name] = currentAttribute.value
    return selfClosingStartTag
  } else if (c === '>') {
    currentToken[currentAttribute.name] = currentAttribute.value
    emit(currentToken)
    return data
  } else if (c === '\u0000') {

  } else if (c === '\'' || c === '"' || c === '<' || c === '=' || c === '`' || c === EOF) {

  } else {
    currentAttribute.value += c
    return unquotedAttributeValue
  }
}

function afterQuotedAttributeValue(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/)) {
    return beforeAttributeName
  } else if (c === '/') {
    return selfClosingStartTag
  } else if (c === '>') {
    currentToken[currentAttribute.name] = currentAttribute.value
    emit(currentToken)
    return data
  } else if (c === EOF) {

  } else {
    currentAttribute.value += c
    return doubleQuotedAttributeValue
  }
}

function beforeAttributeValue(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) {
    return beforeAttributeValue
  } else if (c === '"') {
    return doubleQuotedAttributeValue
  } else if (c === "'") {
    return singleQuotedAttributeValue
  } else if (c === '>') {

  } else {
    return unquotedAttributeValue
  }

}

function afterAttributeName(c: cType) {
  if ((c as string).match(/^[\t\n\f ]$/)) {
    return afterAttributeName
  } else if (c === '/') {
    return selfClosingStartTag
  } else if (c === '=') {
    return beforeAttributeValue
  } else if (c === '>') {
    currentToken[currentAttribute.name] = currentAttribute.value
    emit(currentToken)
    return data
  } else if (c === EOF) {

  } else {
    currentToken[currentAttribute.name] = currentAttribute.value
    currentAttribute = {
      name: '',
      value: ''
    }
    return attributeName
  }
}

function selfClosingStartTag(c: cType) {
  if (c === '>') {
    currentToken.isSelfClosing = true
    emit(currentToken)
    return data
  } else if (c === EOF) {

  } else {

  }
}

export function parseHTML(html: string) {
  let state: Function = data
  for (let c of html) {
    state = state(c)
  }
  state = state(EOF)
  return stack[0]
}
