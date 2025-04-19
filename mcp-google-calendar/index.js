#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Debug log utility
function debugLog(...args) {
    console.error('DEBUG:', new Date().toISOString(), ...args);
}

// 일정 추가
const CREATE_EVENT_TOOL = {
    name: "create_event",
    description: "Create a calendar event with specified details",
    inputSchema: {
        type: "object",
        properties: {
            summary: {
                type: "string",
                description: "Event title"
            },
            start_time: {
                type: "string",
                description: "Start time (ISO format)"
            },
            end_time: {
                type: "string",
                description: "End time (ISO format)"
            },
            description: {
                type: "string",
                description: "Event description"
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "List of attendee emails"
            }
        },
        required: ["summary", "start_time", "end_time"]
    }
};

// 일정 조회
const LIST_EVENTS_TOOL = {
    name: "list_events",
    description: "List calendar events in a specified time range",
    inputSchema: {
        type: "object",
        properties: {
            time_min: {
                type: "string",
                description: "Start time for event search (ISO format)"
            },
            time_max: {
                type: "string",
                description: "End time for event search (ISO format)"
            },
            max_results: {
                type: "integer",
                description: "Maximum number of events to return"
            }
        },
        required: ["time_min", "time_max"]
    }
};

// 일정 수정
const UPDATE_EVENT_TOOL = {
    name: "update_event",
    description: "Update an existing calendar event",
    inputSchema: {
        type: "object",
        properties: {
            event_id: {
                type: "string",
                description: "ID of the event to update"
            },
            summary: {
                type: "string",
                description: "Updated event title"
            },
            start_time: {
                type: "string",
                description: "Updated start time (ISO format)"
            },
            end_time: {
                type: "string",
                description: "Updated end time (ISO format)"
            },
            description: {
                type: "string",
                description: "Updated event description"
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "Updated list of attendee emails"
            }
        },
        required: ["event_id"]
    }
};

// 일정 삭제
const DELETE_EVENT_TOOL = {
    name: "delete_event",
    description: "Delete a calendar event",
    inputSchema: {
        type: "object",
        properties: {
            event_id: {
                type: "string",
                description: "ID of the event to delete"
            }
        },
        required: ["event_id"]
    }
};

// Server implementation
const server = new Server({
    name: "mcp_calendar",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

debugLog('Server initialized');

// Get environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Error: CLIENT_ID and CLIENT_SECRET environment variables are required");
    process.exit(1);
}

// 인증된 캘린더 서비스 가져오기
async function getCalendarService() {
    debugLog('Creating OAuth2 client');
    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );
    debugLog('OAuth2 client created');
    
    debugLog('Setting credentials');
    oauth2Client.setCredentials({
        refresh_token: REFRESH_TOKEN,
        token_uri: "https://oauth2.googleapis.com/token"
    });
    debugLog('Credentials set');

    debugLog('Creating calendar service');
    const calendar = google.calendar({ 
        version: 'v3',
        auth: oauth2Client
    });
    debugLog('Calendar service created');
    
    return calendar;
}

// 이벤트 조회 함수
async function listCalendarEvents(args) {
    debugLog('Listing calendar events with args:', JSON.stringify(args, null, 2));
    
    try {
        const calendar = await getCalendarService();
        
        const listParams = {
            calendarId: 'primary',
            timeMin: args.time_min,
            timeMax: args.time_max,
            singleEvents: true,
            orderBy: 'startTime'
        };
        
        if (args.max_results) {
            listParams.maxResults = args.max_results;
        }
        
        debugLog('Attempting to list events with params:', JSON.stringify(listParams, null, 2));
        const response = await calendar.events.list(listParams);
        
        const events = response.data.items;
        debugLog(`Found ${events.length} events`);
        
        if (events.length === 0) {
            return "No events found in the specified time range.";
        }
        
        const formattedEvents = events.map((event, index) => {
            const start = event.start.dateTime || event.start.date;
            const end = event.end.dateTime || event.end.date;
            return `${index + 1}. ${event.summary} (ID: ${event.id})\n   시작: ${start}\n   종료: ${end}\n   링크: ${event.htmlLink}\n`;
        }).join('\n');
        
        return `이벤트 목록:\n\n${formattedEvents}`;
    } catch (error) {
        debugLog('ERROR OCCURRED:', error);
        throw new Error(`Failed to list events: ${error.message}`);
    }
}

// 이벤트 수정 함수
async function updateCalendarEvent(args) {
    debugLog('Updating calendar event with args:', JSON.stringify(args, null, 2));
    
    try {
        const calendar = await getCalendarService();
        
        // 먼저 이벤트 가져오기
        debugLog('Fetching current event data');
        const currentEvent = await calendar.events.get({
            calendarId: 'primary',
            eventId: args.event_id
        });
        
        // 수정할 이벤트 객체 생성
        const updatedEvent = {
            summary: args.summary || currentEvent.data.summary,
            description: args.description || currentEvent.data.description,
            start: currentEvent.data.start,
            end: currentEvent.data.end
        };
        
        // 시작/종료 시간 업데이트
        if (args.start_time) {
            updatedEvent.start = {
                dateTime: args.start_time,
                timeZone: 'Asia/Seoul'
            };
        }
        
        if (args.end_time) {
            updatedEvent.end = {
                dateTime: args.end_time,
                timeZone: 'Asia/Seoul'
            };
        }
        
        // 참석자 업데이트
        if (args.attendees) {
            updatedEvent.attendees = args.attendees.map(email => ({ email }));
        }
        
        debugLog('Updating event with data:', JSON.stringify(updatedEvent, null, 2));
        const response = await calendar.events.update({
            calendarId: 'primary',
            eventId: args.event_id,
            requestBody: updatedEvent
        });
        
        return `이벤트가 업데이트되었습니다: ${response.data.htmlLink}`;
    } catch (error) {
        debugLog('ERROR OCCURRED:', error);
        throw new Error(`Failed to update event: ${error.message}`);
    }
}

// 이벤트 삭제 함수
async function deleteCalendarEvent(args) {
    debugLog('Deleting calendar event with ID:', args.event_id);
    
    try {
        const calendar = await getCalendarService();
        
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: args.event_id
        });
        
        return `이벤트 ID ${args.event_id}가 성공적으로 삭제되었습니다.`;
    } catch (error) {
        debugLog('ERROR OCCURRED:', error);
        throw new Error(`Failed to delete event: ${error.message}`);
    }
}

// 기존 Calendar event creation function 수정
async function createCalendarEvent(args) {
    debugLog('Creating calendar event with args:', JSON.stringify(args, null, 2));
    
    try {
        const calendar = await getCalendarService();
        
        const event = {
            summary: args.summary,
            description: args.description,
            start: {
                dateTime: args.start_time,
                timeZone: 'Asia/Seoul',
            },
            end: {
                dateTime: args.end_time,
                timeZone: 'Asia/Seoul',
            }
        };
        debugLog('Event object created:', JSON.stringify(event, null, 2));

        if (args.attendees) {
            event.attendees = args.attendees.map(email => ({ email }));
            debugLog('Attendees added:', event.attendees);
        }

        debugLog('Attempting to insert event');
        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });
        debugLog('Event insert response:', JSON.stringify(response.data, null, 2));
        return `Event created: ${response.data.htmlLink}`;
    } catch (error) {
        debugLog('ERROR OCCURRED:');
        debugLog('Error name:', error.name);
        debugLog('Error message:', error.message);
        debugLog('Error stack:', error.stack);
        throw new Error(`Failed to create event: ${error.message}`);
    }
}


// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    debugLog('List tools request received');
    return { tools: [CREATE_EVENT_TOOL, LIST_EVENTS_TOOL, UPDATE_EVENT_TOOL, DELETE_EVENT_TOOL] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    debugLog('Call tool request received:', JSON.stringify(request, null, 2));
    
    try {
        const { name, arguments: args } = request.params;
        if (!args) {
            throw new Error("No arguments provided");
        }

        switch (name) {
            case "create_event": {
                debugLog('Handling create_event request');
                const result = await createCalendarEvent(args);
                debugLog('Event creation successful:', result);
                return {
                    content: [{ type: "text", text: result }],
                    isError: false,
                };
            }
            case "list_events": {
                debugLog('Handling list_events request');
                const result = await listCalendarEvents(args);
                debugLog('Event listing successful');
                return {
                    content: [{ type: "text", text: result }],
                    isError: false,
                };
            }
            case "update_event": {
                debugLog('Handling update_event request');
                const result = await updateCalendarEvent(args);
                debugLog('Event update successful:', result);
                return {
                    content: [{ type: "text", text: result }],
                    isError: false,
                };
            }
            case "delete_event": {
                debugLog('Handling delete_event request');
                const result = await deleteCalendarEvent(args);
                debugLog('Event deletion successful:', result);
                return {
                    content: [{ type: "text", text: result }],
                    isError: false,
                };
            }
            default:
                debugLog('Unknown tool requested:', name);
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    } catch (error) {
        debugLog('Error in call tool handler:', error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});

// Server startup function
async function runServer() {
    debugLog('Starting server');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    debugLog('Server connected to transport');
    console.error("Calendar MCP Server running on stdio");
}

// Start the server
runServer().catch((error) => {
    debugLog('Fatal server error:', error);
    console.error("Fatal error running server:", error);
    process.exit(1);
});